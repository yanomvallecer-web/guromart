-- Sellers edit their own shop profile. They can't move the shop to another
-- account or change its address (links to it would break), and logo and
-- banner images must come from their own folder in storefront-media.

create or replace function private.guard_storefront()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_request() and not private.is_admin() then
    if new.seller_account_id is distinct from old.seller_account_id or new.slug is distinct from old.slug then
      raise exception 'The shop address and owner cannot be changed' using errcode = '42501';
    end if;
    if (new.logo_path is distinct from old.logo_path and new.logo_path is not null
          and new.logo_path not like (new.seller_account_id::text || '/%'))
      or (new.banner_path is distinct from old.banner_path and new.banner_path is not null
          and new.banner_path not like (new.seller_account_id::text || '/%')) then
      raise exception 'Shop images must come from your own folder' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger storefronts_guard before update on public.storefronts
  for each row execute function private.guard_storefront();

-- Approving a listing opens the shop only when it first activates the seller.
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
      -- Open the shop on first activation only; later, a seller who hid their shop keeps it hidden.
      update public.storefronts set is_published = true where id = v_product.storefront_id and not is_published;
    end if;

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

