-- Listing moderation. Staff mark each uploaded file safe (or blocked) after
-- checking it, then approve or reject the listing. A listing can only go live
-- when every file has been checked and found clean, whoever makes the change.

create or replace function private.check_publishable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    if new.copyright_declared_at is null then
      raise exception 'A listing needs the seller''s rights confirmation before it goes live' using errcode = '23514';
    end if;
    if not exists (select 1 from public.product_files where product_id = new.id) then
      raise exception 'A listing needs at least one file before it goes live' using errcode = '23514';
    end if;
    if exists (select 1 from public.product_files where product_id = new.id and scan_status <> 'clean') then
      raise exception 'Every file must be checked and marked clean before the listing goes live' using errcode = '23514';
    end if;
    if not exists (select 1 from public.product_previews where product_id = new.id) then
      raise exception 'A listing needs at least one preview image before it goes live' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Named to fire after products_guard (triggers run in name order).
create trigger products_publish_check before update on public.products
  for each row execute function private.check_publishable();

-- File check results are audited.
create or replace function private.audit_file_scan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scan_status is distinct from old.scan_status then
    perform private.audit('product_file.scan_marked', 'product', new.product_id::text,
      jsonb_build_object('file_id', new.id, 'from', old.scan_status, 'to', new.scan_status));
  end if;
  return new;
end;
$$;

create trigger product_files_audit_scan after update on public.product_files
  for each row execute function private.audit_file_scan();

-- Staff can only change a file's check result, never what or where it is.
create or replace function private.guard_file_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_request() and (
    new.product_id is distinct from old.product_id
    or new.storage_path is distinct from old.storage_path
    or new.size_bytes is distinct from old.size_bytes
    or new.file_format is distinct from old.file_format
    or new.mime_type is distinct from old.mime_type
    or new.sha256 is distinct from old.sha256
  ) then
    raise exception 'Only the file check result can be changed' using errcode = '42501';
  end if;
  if new.scan_status is distinct from old.scan_status then
    new.scanned_at := now();
  end if;
  return new;
end;
$$;

create trigger product_files_guard_update before update on public.product_files
  for each row execute function private.guard_file_update();

-- Approve or reject a listing in review. Approving a seller's listing also
-- opens their shop: identity verification gates payouts, not listing.
create or replace function public.review_listing(p_product_id uuid, p_approve boolean, p_reason text default null)
returns public.product_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_owner uuid;
  v_account uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.is_admin() then
    raise exception 'Only GuroMart staff can review listings' using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Unknown listing' using errcode = 'P0002';
  end if;
  if v_product.status <> 'pending_review' then
    raise exception 'This listing is not waiting for review' using errcode = '22023';
  end if;

  select a.user_id, a.id into v_owner, v_account
  from public.storefronts s join public.seller_accounts a on a.id = s.seller_account_id
  where s.id = v_product.storefront_id;

  if p_approve then
    update public.products set status = 'published', rejection_reason = null where id = p_product_id;

    update public.seller_accounts set status = 'active' where id = v_account and status = 'onboarding';
    if found then
      perform private.audit('seller.activated', 'seller_account', v_account::text, jsonb_build_object('via_product', p_product_id));
    end if;
    update public.storefronts set is_published = true where id = v_product.storefront_id and not is_published;

    insert into public.notifications (user_id, type, title, body, link_path)
    values (v_owner, 'listing.approved', 'Your resource is live',
      left(format('"%s" passed review and teachers can now find it.', v_product.title), 1000),
      '/seller/products/' || p_product_id);
    return 'published';
  end if;

  if v_reason is null or char_length(v_reason) < 10 then
    raise exception 'Tell the seller what to fix (at least 10 characters)' using errcode = '22023';
  end if;
  update public.products set status = 'rejected', rejection_reason = left(v_reason, 1000) where id = p_product_id;
  insert into public.notifications (user_id, type, title, body, link_path)
  values (v_owner, 'listing.rejected', 'Your resource needs changes',
    left(format('"%s": %s', v_product.title, v_reason), 1000), '/seller/products/' || p_product_id);
  return 'rejected';
end;
$$;

revoke all on function public.review_listing(uuid, boolean, text) from public, anon;
grant execute on function public.review_listing(uuid, boolean, text) to authenticated;
