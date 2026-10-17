-- DepEd now splits the school year into Term 1 to Term 3. The codes stay
-- trimester-N so saved links and filters keep working; only the names change.
update public.academic_periods set name = 'Term ' || sequence, period_kind = 'term'
where code in ('trimester-1', 'trimester-2', 'trimester-3');

insert into public.search_synonyms (term, expansion) values
  ('trimester', 'term')
on conflict (term) do nothing;

-- Search also matches what a listing is tagged with: resource type, subject,
-- grade levels, curriculum, term or quarter, language and file formats.
-- Words can come from any field, so "grade 5 term 1 fractions" finds a
-- Grade 5 listing for Term 1 whose title says fractions.
create or replace function public.product_keywords(p_product_id uuid)
returns tsvector
language sql
stable
set search_path = ''
as $$
  select to_tsvector('simple', concat_ws(' ',
    c.name, s.name, cu.name, a.name, p.period_detail, l.name,
    array_to_string(p.file_formats, ' '),
    (select string_agg(g.name, ' ')
     from public.product_grade_levels pg join public.grade_levels g on g.id = pg.grade_level_id
     where pg.product_id = p.id)))
  from public.products p
  left join public.product_categories c on c.id = p.category_id
  left join public.subjects s on s.id = p.subject_id
  left join public.curricula cu on cu.id = p.curriculum_id
  left join public.academic_periods a on a.id = p.academic_period_id
  left join public.languages l on l.code = p.language_code
  where p.id = p_product_id;
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
  filtered as (
    select p.id, p.title, p.search_vector, p.published_at, p.price_centavos, p.sales_count, p.download_count, p.rating_avg, p.rating_count
    from public.products p
    where p.status = 'published'
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
  ),
  matches as (
    select f.*,
      case when params.q is null then 0
        else ts_rank_cd(f.search_vector || setweight(k.v, 'C'), params.tsq) + 0.5 * extensions.word_similarity(lower(params.q), lower(f.title))
      end as rank
    from filtered f
    cross join params
    -- Keywords are only built when there is something to search for.
    left join lateral (select public.product_keywords(f.id) as v where params.q is not null) k on true
    where params.q is null
      or (f.search_vector || k.v) @@ params.tsq
      -- Typo tolerance on titles, e.g. "fractoins" still finds "fractions".
      or extensions.word_similarity(lower(params.q), lower(f.title)) >= 0.5
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

grant execute on function public.product_keywords(uuid) to anon, authenticated;
