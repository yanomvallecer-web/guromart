-- Cart, free "get" flow and the buyer's library.
-- Cart rows are written by the buyer (RLS) but checked here, so only paid,
-- live resources the buyer neither owns nor sells can be added. Free
-- resources are claimed through claim_free_product(), and every download
-- goes through start_download(), which checks the entitlement and logs it.

-- Why a product can't go in the caller's cart, or null when it can.
create or replace function private.cart_item_problem(p_product_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.id is null or not private.product_is_public(p.id) then 'This resource is not available'
    when p.price_centavos = 0 then 'This resource is free. Use "Get it free" instead'
    when a.user_id = auth.uid() then 'You can''t buy your own resource'
    when private.has_entitlement(p.id) then 'This resource is already in your library'
  end
  from (select p_product_id as id) x
  left join public.products p on p.id = x.id
  left join public.storefronts s on s.id = p.storefront_id
  left join public.seller_accounts a on a.id = s.seller_account_id;
$$;

grant execute on function private.cart_item_problem(uuid) to authenticated, service_role;

create or replace function private.guard_cart_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_problem text;
begin
  if private.is_client_request() then
    v_problem := private.cart_item_problem(new.product_id);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = '23514';
    end if;
    if (select count(*) from public.cart_items where cart_id = new.cart_id) >= 50 then
      raise exception 'Your cart is full (50 resources). Check out or remove some first' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger cart_items_guard before insert on public.cart_items
  for each row execute function private.guard_cart_item();

-- Claim a free resource. Paid resources are only granted by a verified payment.
create or replace function public.claim_free_product(p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_price integer;
  v_entitlement public.entitlements%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in to get this resource' using errcode = '42501';
  end if;
  select price_centavos into v_price from public.products where id = p_product_id;
  if not found or not private.product_is_public(p_product_id) then
    raise exception 'This resource is not available' using errcode = 'P0002';
  end if;
  if v_price <> 0 then
    raise exception 'This resource is not free' using errcode = '22023';
  end if;

  insert into public.entitlements (user_id, product_id, source)
  values (v_user, p_product_id, 'free')
  on conflict (user_id, product_id) do nothing;

  select * into v_entitlement from public.entitlements where user_id = v_user and product_id = p_product_id;
  if v_entitlement.revoked_at is not null then
    raise exception 'Your access to this resource was removed' using errcode = '42501';
  end if;
  delete from public.cart_items i using public.carts c
  where c.id = i.cart_id and c.user_id = v_user and i.product_id = p_product_id;
  return v_entitlement.id;
end;
$$;

revoke all on function public.claim_free_product(uuid) from public, anon;
grant execute on function public.claim_free_product(uuid) to authenticated;

-- Check access to one file and log the download. Returns where the file is
-- stored so the server can sign a short-lived link. Buyers keep access when a
-- listing is later archived; a refund or takedown revokes the entitlement.
create or replace function public.start_download(p_file_id uuid)
returns table (storage_path text, file_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_file public.product_files%rowtype;
  v_entitlement uuid;
  v_first boolean;
begin
  if v_user is null then
    raise exception 'Sign in to download' using errcode = '42501';
  end if;
  select * into v_file from public.product_files where id = p_file_id;
  if found then
    select e.id into v_entitlement from public.entitlements e
    where e.user_id = v_user and e.product_id = v_file.product_id and e.revoked_at is null;
  end if;
  if v_entitlement is null then
    raise exception 'You don''t have access to this file' using errcode = '42501';
  end if;
  if v_file.scan_status <> 'clean' then
    raise exception 'This file is not available right now' using errcode = '22023';
  end if;
  if (select count(*) from public.downloads d where d.user_id = v_user and d.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many downloads in the last hour. Please try again later' using errcode = '54000';
  end if;

  v_first := not exists (select 1 from public.downloads d where d.entitlement_id = v_entitlement);
  insert into public.downloads (entitlement_id, user_id, product_file_id) values (v_entitlement, v_user, p_file_id);
  -- Counts teachers who downloaded, not clicks.
  if v_first then
    update public.products set download_count = download_count + 1 where id = v_file.product_id;
  end if;

  return query select v_file.storage_path, v_file.original_filename;
end;
$$;

revoke all on function public.start_download(uuid) from public, anon;
grant execute on function public.start_download(uuid) to authenticated;

-- The caller's library: what they own, with each file's details. Owned
-- resources stay listed after the seller archives them.
create or replace function public.my_library()
returns table (
  entitlement_id uuid,
  product_id uuid,
  slug text,
  title text,
  is_live boolean,
  shop_name text,
  shop_slug text,
  source text,
  granted_at timestamptz,
  files jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, p.id, p.slug, p.title, private.product_is_public(p.id), s.name, s.slug, e.source, e.granted_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.original_filename, 'format', f.file_format, 'size', f.size_bytes,
        'available', f.scan_status = 'clean') order by f.sort_order, f.created_at)
      from public.product_files f where f.product_id = p.id
    ), '[]'::jsonb)
  from public.entitlements e
  join public.products p on p.id = e.product_id
  join public.storefronts s on s.id = p.storefront_id
  where e.user_id = auth.uid() and e.revoked_at is null
  order by e.granted_at desc;
$$;

revoke all on function public.my_library() from public, anon;
grant execute on function public.my_library() to authenticated;
