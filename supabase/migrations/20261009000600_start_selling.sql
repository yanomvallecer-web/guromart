-- Onboarding step 2-3: a signed-in user becomes a seller and opens a storefront.
-- Runs as definer so it can create the seller account and grant the seller
-- role, which clients cannot do directly. It only ever acts for auth.uid().

create or replace function public.start_selling(
  p_seller_type public.seller_type,
  p_store_name text,
  p_store_slug text,
  p_agree_to_terms boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_seller uuid;
  v_store uuid;
begin
  if v_user is null then
    raise exception 'Sign in to start selling' using errcode = '28000';
  end if;
  if not coalesce(p_agree_to_terms, false) then
    raise exception 'You need to accept the seller terms' using errcode = '22023';
  end if;
  if exists (select 1 from public.seller_accounts where user_id = v_user) then
    raise exception 'You already have a seller account' using errcode = '23505';
  end if;
  if exists (select 1 from public.storefronts where slug = lower(p_store_slug)) then
    raise exception 'That shop address is taken' using errcode = '23505', constraint = 'storefronts_slug_key';
  end if;

  insert into public.seller_accounts (user_id, seller_type, onboarding_step, agreed_to_seller_terms_at)
  values (v_user, p_seller_type, 4, now())
  returning id into v_seller;

  insert into public.storefronts (seller_account_id, slug, name)
  values (v_seller, lower(p_store_slug), btrim(p_store_name))
  returning id into v_store;

  insert into public.user_roles (user_id, role, granted_by)
  values (v_user, 'seller', v_user)
  on conflict do nothing;

  perform private.audit('seller.onboarding_started', 'seller_account', v_seller::text,
    jsonb_build_object('seller_type', p_seller_type, 'storefront_id', v_store));
  return v_store;
end;
$$;

revoke all on function public.start_selling(public.seller_type, text, text, boolean) from public, anon;
grant execute on function public.start_selling(public.seller_type, text, text, boolean) to authenticated;
