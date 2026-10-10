-- Marketplace growth: a 10% GuroMart fee, teaching preferences, lesson
-- bundles, seller replies to reviews and their moderation, and following
-- shops. Everything here is additive: no table loses data.

------------------------------------------------------------------------------
-- GuroMart's fee: 10% of each sale on every plan (seller keeps 90%).
-- Orders already paid keep the rate stored on their order items.
------------------------------------------------------------------------------

update public.platform_settings set value = '1000', description = 'GuroMart fee on the Starter plan (seller keeps 90%)'
where key = 'commission.starter_bps';
update public.platform_settings set value = '1000', description = 'GuroMart fee on the Pro plan (seller keeps 90%)'
where key = 'commission.pro_bps';

------------------------------------------------------------------------------
-- Teaching preferences: the grade and subject a teacher teaches, used to
-- pre-filter Browse. Saved resources use the existing wishlists table.
------------------------------------------------------------------------------

create table public.teaching_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  grade_level_id smallint references public.grade_levels (id) on delete set null,
  subject_id smallint references public.subjects (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger teaching_preferences_updated_at before update on public.teaching_preferences
  for each row execute function private.set_updated_at();

alter table public.teaching_preferences enable row level security;
create policy "teaching_preferences: owner manages" on public.teaching_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

------------------------------------------------------------------------------
-- Lesson bundles: a seller groups their own live resources (for example a
-- lesson plan, slides, worksheet and assessment on one topic) and sells them
-- together for less than their total.
------------------------------------------------------------------------------

create table public.bundles (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.storefronts (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,118}[a-z0-9])$'),
  title text not null check (char_length(title) between 4 and 160),
  topic text check (char_length(topic) <= 200),
  description text check (char_length(description) <= 4000),
  price_centavos integer not null check (price_centavos >= 3000 and price_centavos <= 1000000),
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bundles_updated_at before update on public.bundles
  for each row execute function private.set_updated_at();

create table public.bundle_items (
  bundle_id uuid not null references public.bundles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sort_order smallint not null default 0,
  primary key (bundle_id, product_id)
);

create index bundle_items_product_idx on public.bundle_items (product_id);
create index bundles_storefront_idx on public.bundles (storefront_id, created_at desc);

create or replace function private.owns_storefront(p_storefront_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.storefronts s
    join public.seller_accounts a on a.id = s.seller_account_id
    where s.id = p_storefront_id and a.user_id = auth.uid()
  );
$$;

-- A bundle is public when it is published, its shop is public and every
-- resource in it is live and paid.
create or replace function private.bundle_is_public(p_bundle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bundles b
    join public.storefronts s on s.id = b.storefront_id and s.is_published
    where b.id = p_bundle_id and b.status = 'published'
  )
  and (select count(*) from public.bundle_items i where i.bundle_id = p_bundle_id) >= 2
  and not exists (
    select 1 from public.bundle_items i
    join public.products p on p.id = i.product_id
    where i.bundle_id = p_bundle_id and (p.status <> 'published' or p.price_centavos = 0)
  );
$$;

-- Sellers may only put their own paid, live resources in a bundle, and only
-- staff can hide one. Publishing needs at least two resources and a price
-- below their total.
create or replace function private.guard_bundle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_items integer;
  v_total bigint;
begin
  if private.is_client_request() and not private.is_admin() then
    if tg_op = 'UPDATE' and (new.storefront_id is distinct from old.storefront_id or new.slug is distinct from old.slug) then
      raise exception 'A bundle''s shop and address cannot be changed' using errcode = '42501';
    end if;
    if new.status = 'hidden' and (tg_op = 'INSERT' or old.status <> 'hidden') then
      raise exception 'Only GuroMart staff can hide a bundle' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.status = 'hidden' and new.status <> 'hidden' then
      raise exception 'This bundle was hidden by GuroMart staff' using errcode = '42501';
    end if;
  end if;
  if new.status = 'published' then
    select count(*), coalesce(sum(p.price_centavos), 0) into v_items, v_total
    from public.bundle_items i join public.products p on p.id = i.product_id
    where i.bundle_id = new.id and p.status = 'published' and p.price_centavos > 0;
    if v_items < 2 then
      raise exception 'A bundle needs at least two live, paid resources' using errcode = '23514';
    end if;
    if new.price_centavos >= v_total then
      raise exception 'The bundle price must be less than the resources cost separately (₱%)', to_char(v_total / 100.0, 'FM999,990.00')
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger bundles_guard before insert or update on public.bundles
  for each row execute function private.guard_bundle();

create or replace function private.guard_bundle_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_request() and not private.is_admin() then
    if not exists (
      select 1 from public.bundles b
      join public.products p on p.storefront_id = b.storefront_id
      where b.id = new.bundle_id and p.id = new.product_id and p.status = 'published' and p.price_centavos > 0
    ) then
      raise exception 'Only your own live, paid resources can go in a bundle' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger bundle_items_guard before insert or update on public.bundle_items
  for each row execute function private.guard_bundle_item();

alter table public.bundles enable row level security;
alter table public.bundle_items enable row level security;

create policy "bundles: public reads live, owner and admin read all" on public.bundles
  for select to anon, authenticated
  using (private.bundle_is_public(id) or private.owns_storefront(storefront_id) or private.is_admin());
create policy "bundles: owner creates" on public.bundles
  for insert to authenticated with check (private.owns_storefront(storefront_id));
create policy "bundles: owner or admin updates" on public.bundles
  for update to authenticated
  using (private.owns_storefront(storefront_id) or private.is_admin())
  with check (private.owns_storefront(storefront_id) or private.is_admin());
create policy "bundles: owner deletes unpublished" on public.bundles
  for delete to authenticated using (private.owns_storefront(storefront_id) and status = 'draft');

create policy "bundle_items: read with the bundle" on public.bundle_items
  for select to anon, authenticated
  using (exists (select 1 from public.bundles b where b.id = bundle_id));
create policy "bundle_items: owner manages draft bundles" on public.bundle_items
  for all to authenticated
  using (exists (select 1 from public.bundles b where b.id = bundle_id and private.owns_storefront(b.storefront_id) and b.status = 'draft'))
  with check (exists (select 1 from public.bundles b where b.id = bundle_id and private.owns_storefront(b.storefront_id) and b.status = 'draft'));

-- Buy a bundle: one order with an item per resource. The bundle price is
-- split across the resources in proportion to their own prices (the last
-- one takes the rounding), so access, seller earnings and refunds work per
-- resource exactly as for any order. Access is still granted only by a
-- verified PayMongo webhook.
create or replace function public.create_order_for_bundle(p_bundle_id uuid)
returns table (order_id uuid, order_number text, total_centavos integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_bundle public.bundles%rowtype;
  v_total bigint;
  v_left integer;
  v_count integer;
  v_i integer := 0;
  v_share integer;
  v_problem text;
  v_order public.orders%rowtype;
  r record;
begin
  if v_user is null then
    raise exception 'Sign in to check out' using errcode = '42501';
  end if;
  select * into v_bundle from public.bundles where id = p_bundle_id;
  if not found or not private.bundle_is_public(p_bundle_id) then
    raise exception 'This bundle is not available' using errcode = 'P0002';
  end if;

  for r in
    select p.id, p.title from public.bundle_items i join public.products p on p.id = i.product_id
    where i.bundle_id = p_bundle_id order by i.sort_order, p.title
  loop
    v_problem := private.cart_item_problem(r.id);
    if v_problem is not null then
      raise exception '%: %', r.title, v_problem using errcode = '23514';
    end if;
  end loop;

  select sum(p.price_centavos), count(*) into v_total, v_count
  from public.bundle_items i join public.products p on p.id = i.product_id
  where i.bundle_id = p_bundle_id;

  insert into public.orders (user_id, subtotal_centavos, total_centavos, payment_provider)
  values (v_user, v_bundle.price_centavos, v_bundle.price_centavos, 'paymongo')
  returning * into v_order;

  v_left := v_bundle.price_centavos;
  for r in
    select p.id, p.title, p.license_type, p.price_centavos, s.seller_account_id, private.commission_bps_for(s.seller_account_id) as bps
    from public.bundle_items i
    join public.products p on p.id = i.product_id
    join public.storefronts s on s.id = p.storefront_id
    where i.bundle_id = p_bundle_id
    order by i.sort_order, p.title
  loop
    v_i := v_i + 1;
    v_share := case when v_i = v_count then v_left else floor(v_bundle.price_centavos::numeric * r.price_centavos / v_total)::integer end;
    v_left := v_left - v_share;
    if r.bps is null then
      raise exception 'A seller''s commission rate is missing' using errcode = '22023';
    end if;
    insert into public.order_items (order_id, product_id, seller_account_id, title_snapshot, license_type_snapshot,
      unit_price_centavos, commission_bps, platform_fee_centavos, seller_earnings_centavos)
    values (v_order.id, r.id, r.seller_account_id, r.title, r.license_type, v_share, r.bps,
      round(v_share * r.bps / 10000.0)::integer, v_share - round(v_share * r.bps / 10000.0)::integer);
  end loop;

  perform private.audit('order.bundle', 'order', v_order.id::text, jsonb_build_object('bundle_id', p_bundle_id));
  return query select v_order.id, v_order.order_number, v_order.total_centavos;
end;
$$;

revoke all on function public.create_order_for_bundle(uuid) from public, anon;
grant execute on function public.create_order_for_bundle(uuid) to authenticated;

------------------------------------------------------------------------------
-- Reviews: sellers can reply once (and edit their reply); staff can hide.
-- Only buyers who own a resource can review it (existing policy).
------------------------------------------------------------------------------

alter table public.reviews
  add column seller_reply text check (char_length(seller_reply) <= 1000),
  add column seller_replied_at timestamptz;

-- Replaces the earlier guard: reviewers can't touch the seller's reply, and
-- sellers change nothing but it.
create or replace function private.guard_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_request() and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'published';
      new.seller_reply := null;
      new.seller_replied_at := null;
    elsif new.status is distinct from old.status or new.product_id is distinct from old.product_id
      or new.user_id is distinct from old.user_id then
      raise exception 'Only GuroMart staff can change this review field' using errcode = '42501';
    elsif new.seller_reply is distinct from old.seller_reply or new.seller_replied_at is distinct from old.seller_replied_at then
      raise exception 'Only the seller can reply to a review' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.reply_to_review(p_review_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  select product_id into v_product from public.reviews where id = p_review_id;
  if v_product is null or not private.owns_product(v_product) then
    raise exception 'Only the seller of this resource can reply' using errcode = '42501';
  end if;
  if v_reply is not null and char_length(v_reply) > 1000 then
    raise exception 'Keep the reply under 1,000 characters' using errcode = '22023';
  end if;
  update public.reviews set seller_reply = v_reply, seller_replied_at = case when v_reply is null then null else now() end
  where id = p_review_id;
end;
$$;

revoke all on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

-- Published reviews of a live resource, with the reviewer's first name only.
create or replace function public.product_reviews(p_product_id uuid)
returns table (id uuid, rating smallint, body text, created_at timestamptz, reviewer text, seller_reply text, seller_replied_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.body, r.created_at,
    coalesce(nullif(split_part(btrim(pr.display_name), ' ', 1), ''), 'A teacher'),
    r.seller_reply, r.seller_replied_at
  from public.reviews r
  left join public.profiles pr on pr.id = r.user_id
  where r.product_id = p_product_id and r.status = 'published' and private.product_is_public(p_product_id)
  order by r.created_at desc
  limit 100;
$$;

grant execute on function public.product_reviews(uuid) to anon, authenticated;

------------------------------------------------------------------------------
-- Following shops: followers get a notification when the shop publishes a
-- new resource.
------------------------------------------------------------------------------

create table public.shop_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  storefront_id uuid not null references public.storefronts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, storefront_id)
);

create index shop_follows_storefront_idx on public.shop_follows (storefront_id);

alter table public.shop_follows enable row level security;
create policy "shop_follows: owner manages" on public.shop_follows
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.shop_follower_count(p_storefront_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.shop_follows where storefront_id = p_storefront_id;
$$;

grant execute on function public.shop_follower_count(uuid) to anon, authenticated;

create or replace function private.notify_shop_followers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop text;
  v_link text := '/resources/' || new.slug;
begin
  if new.status = 'published' and old.status is distinct from 'published'
    and not exists (select 1 from public.notifications where type = 'shop.new_resource' and link_path = v_link) then
    select name into v_shop from public.storefronts where id = new.storefront_id;
    insert into public.notifications (user_id, type, title, body, link_path)
    select f.user_id, 'shop.new_resource', left('New from ' || v_shop, 160), left(new.title, 1000), v_link
    from public.shop_follows f
    where f.storefront_id = new.storefront_id;
  end if;
  return null;
end;
$$;

create trigger products_notify_followers after update of status on public.products
  for each row execute function private.notify_shop_followers();
