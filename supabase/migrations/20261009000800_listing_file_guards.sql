-- Files and previews must live in the owning seller's folder for that product,
-- and can only change while the listing is not live. This keeps a seller from
-- pointing a listing at someone else's object by writing rows directly.

create or replace function private.guard_product_media()
returns trigger
language plpgsql
set search_path = ''
as $$
-- Runs as the caller (not definer) so is_client_request() sees the real role;
-- the lookup only needs the owner's own rows, which RLS allows.
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
  v_seller uuid;
  v_status public.product_status;
begin
  if not private.is_client_request() or private.is_admin() then
    return coalesce(new, old);
  end if;

  select a.id, p.status into v_seller, v_status
  from public.products p
  join public.storefronts s on s.id = p.storefront_id
  join public.seller_accounts a on a.id = s.seller_account_id
  where p.id = v_product;

  if v_status not in ('draft', 'rejected', 'pending_review') then
    raise exception 'Withdraw the listing to a draft before changing its files' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and new.storage_path not like (v_seller::text || '/' || v_product::text || '/%') then
    raise exception 'File path does not belong to this listing' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger product_files_guard_media before insert or delete on public.product_files
  for each row execute function private.guard_product_media();
create trigger product_previews_guard_media before insert or delete on public.product_previews
  for each row execute function private.guard_product_media();

-- Limits that keep one listing reasonable.
create or replace function private.limit_product_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'product_files' and (select count(*) from public.product_files where product_id = new.product_id) >= 10 then
    raise exception 'A listing can have at most 10 files' using errcode = '23514';
  end if;
  if tg_table_name = 'product_previews' and (select count(*) from public.product_previews where product_id = new.product_id) >= 6 then
    raise exception 'A listing can have at most 6 preview images' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger product_files_limit before insert on public.product_files
  for each row execute function private.limit_product_media();
create trigger product_previews_limit before insert on public.product_previews
  for each row execute function private.limit_product_media();
