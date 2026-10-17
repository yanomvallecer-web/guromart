-- Search finds bundles too: by their own title, topic and description, or by
-- any resource inside them. Bundles whose title matches come first.
create or replace function public.search_bundle_ids(
  p_q text,
  p_shop text default null,
  p_limit integer default 8
)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  with params as (
    select btrim(p_q) as q, public.product_search_query(btrim(p_q)) as tsq
    where nullif(btrim(p_q), '') is not null
  ),
  hits as (
    select b.id, b.created_at,
      to_tsvector('simple', concat_ws(' ', b.title, b.topic, b.description)) @@ params.tsq
        or extensions.word_similarity(lower(params.q), lower(b.title)) >= 0.5 as own_match
    from public.bundles b
    cross join params
    where b.status = 'published'
      and private.bundle_is_public(b.id)
      and (p_shop is null or b.storefront_id = (select s.id from public.storefronts s where s.slug = p_shop))
  )
  select h.id
  from hits h
  cross join params
  where h.own_match
    or exists (
      select 1 from public.bundle_items i
      join public.products p on p.id = i.product_id
      where i.bundle_id = h.id
        and (p.search_vector || public.product_keywords(p.id)) @@ params.tsq
    )
  order by h.own_match desc, h.created_at desc, h.id
  limit least(greatest(coalesce(p_limit, 8), 1), 48);
$$;

grant execute on function public.search_bundle_ids(text, text, integer) to anon, authenticated;
