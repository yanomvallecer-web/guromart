-- Ranked catalog search with Filipino/English synonyms and typo tolerance.
-- browse_product_ids() applies every browse filter, ranks text matches and
-- pages the result in one query. It runs as the caller, so row-level security
-- still limits results to live listings from live shops.

create table public.search_synonyms (
  id smallint generated always as identity primary key,
  term text not null unique check (term = lower(term) and char_length(term) between 2 and 60),
  expansion text not null check (char_length(expansion) between 2 and 200),
  created_at timestamptz not null default now()
);

alter table public.search_synonyms enable row level security;
create policy "search_synonyms: everyone reads" on public.search_synonyms for select to anon, authenticated using (true);
create policy "search_synonyms: admin manages" on public.search_synonyms for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- Each term also searches its expansion, and the expansion searches the term.
-- An expansion is a comma-separated list of alternatives; each alternative
-- matches when all of its words appear.
insert into public.search_synonyms (term, expansion) values
  ('dll', 'daily lesson log'),
  ('daily lesson log', 'dll'),
  ('dlp', 'detailed lesson plan'),
  ('detailed lesson plan', 'dlp'),
  ('banghay aralin', 'lesson plan'),
  ('lesson plan', 'banghay aralin'),
  ('las', 'learning activity sheet'),
  ('learning activity sheet', 'las'),
  ('melc', 'most essential learning competencies'),
  ('tos', 'table of specifications'),
  ('table of specifications', 'tos'),
  ('ppt', 'powerpoint presentation'),
  ('powerpoint', 'ppt, presentation'),
  ('pagsusulit', 'quiz, test, assessment'),
  ('quiz', 'pagsusulit'),
  ('modyul', 'module'),
  ('module', 'modyul'),
  ('ap', 'araling panlipunan'),
  ('araling panlipunan', 'ap'),
  ('math', 'mathematics, matematika'),
  ('matematika', 'mathematics, math'),
  ('agham', 'science'),
  ('science', 'agham'),
  ('ingles', 'english'),
  ('esp', 'edukasyon sa pagpapakatao, values'),
  ('gmrc', 'good manners and right conduct'),
  ('mapeh', 'music, arts, physical education, health'),
  ('tle', 'technology and livelihood education'),
  ('epp', 'edukasyong pantahanan at pangkabuhayan'),
  ('kinder', 'kindergarten');

-- The user's query, widened with synonyms for any term it contains.
create or replace function public.product_search_query(p_q text)
returns tsquery
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select string_agg(q::text, ' | ')::tsquery from (
      select websearch_to_tsquery('simple', p_q) as q
      union all
      select plainto_tsquery('simple', btrim(alt))
      from public.search_synonyms s, regexp_split_to_table(s.expansion, ',') alt
      where lower(p_q) ~ ('(^|[^a-z0-9])' || regexp_replace(s.term, '([^a-z0-9 ])', '\\\1', 'g') || '($|[^a-z0-9])')
    ) parts where q::text <> ''),
    websearch_to_tsquery('simple', p_q)
  );
$$;

create or replace function public.browse_product_ids(
  p_q text default null,
  p_category text default null,
  p_grade text default null,
  p_subject text default null,
  p_curriculum text default null,
  p_period text default null,
  p_shop text default null,
  p_language text default null,
  p_format text default null,
  p_price_min integer default null,
  p_price_max integer default null,
  p_sort text default 'newest',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (id uuid, total bigint)
language sql
stable
set search_path = ''
as $$
  with params as (
    select nullif(btrim(p_q), '') as q,
           case when nullif(btrim(p_q), '') is null then null else public.product_search_query(btrim(p_q)) end as tsq
  ),
  matches as (
    select p.id, p.published_at, p.price_centavos, p.sales_count, p.download_count, p.rating_avg, p.rating_count,
      case when params.q is null then 0
        else ts_rank_cd(p.search_vector, params.tsq) + 0.5 * extensions.word_similarity(lower(params.q), lower(p.title))
      end as rank
    from public.products p, params
    where p.status = 'published'
      and (params.q is null
        or p.search_vector @@ params.tsq
        -- Typo tolerance on titles, e.g. "fractoins" still finds "fractions".
        or extensions.word_similarity(lower(params.q), lower(p.title)) >= 0.5)
      and (p_category is null or p.category_id = (select c.id from public.product_categories c where c.code = p_category))
      and (p_subject is null or p.subject_id = (select s.id from public.subjects s where s.code = p_subject))
      and (p_curriculum is null or p.curriculum_id = (select c.id from public.curricula c where c.code = p_curriculum))
      and (p_period is null or p.academic_period_id = (select a.id from public.academic_periods a where a.code = p_period))
      and (p_grade is null or exists (
        select 1 from public.product_grade_levels pg join public.grade_levels g on g.id = pg.grade_level_id
        where pg.product_id = p.id and g.code = p_grade))
      and (p_shop is null or p.storefront_id = (select s.id from public.storefronts s where s.slug = p_shop))
      and (p_language is null or p.language_code = p_language)
      and (p_format is null or p.file_formats @> array[p_format])
      and (p_price_min is null or p.price_centavos >= p_price_min)
      and (p_price_max is null or p.price_centavos <= p_price_max)
  )
  select m.id, count(*) over () as total
  from matches m
  order by
    case when p_sort = 'relevance' then m.rank end desc nulls last,
    case when p_sort = 'price_asc' then m.price_centavos end asc nulls last,
    case when p_sort = 'price_desc' then m.price_centavos end desc nulls last,
    case when p_sort = 'popular' then m.sales_count end desc nulls last,
    case when p_sort = 'popular' then m.download_count end desc nulls last,
    case when p_sort = 'rating' then m.rating_avg end desc nulls last,
    case when p_sort = 'rating' then m.rating_count end desc nulls last,
    m.published_at desc nulls last,
    m.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.product_search_query(text) to anon, authenticated;
grant execute on function public.browse_product_ids(text, text, text, text, text, text, text, text, text, integer, integer, text, integer, integer)
  to anon, authenticated;
