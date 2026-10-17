-- Buy now: an order for one resource, straight from its page, without
-- touching the buyer's cart. Whatever else is in the cart is not charged
-- and stays there. The same rules as checkout from the cart apply: the
-- resource must be live and paid, not already owned and not the buyer's
-- own (private.cart_item_problem), and prices and commission are read from
-- the database, never the browser. Access is still granted only by
-- apply_payment_event() after a verified PayMongo webhook; when it is paid,
-- that function also takes this resource out of the cart if it was there.

create or replace function public.create_order_for_product(p_product_id uuid)
returns table (order_id uuid, order_number text, total_centavos integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_problem text;
  v_seller uuid;
  v_title text;
  v_license public.license_type;
  v_price integer;
  v_bps integer;
  v_order public.orders%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in to check out' using errcode = '42501';
  end if;

  v_problem := private.cart_item_problem(p_product_id);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '23514';
  end if;

  select s.seller_account_id, p.title, p.license_type, p.price_centavos, private.commission_bps_for(s.seller_account_id)
  into v_seller, v_title, v_license, v_price, v_bps
  from public.products p
  join public.storefronts s on s.id = p.storefront_id
  where p.id = p_product_id;

  if v_price is null or v_price <= 0 then
    raise exception 'This resource has nothing to pay for' using errcode = '22023';
  end if;
  if v_bps is null then
    raise exception 'A seller''s commission rate is missing' using errcode = '22023';
  end if;

  insert into public.orders (user_id, subtotal_centavos, total_centavos, payment_provider)
  values (v_user, v_price, v_price, 'paymongo')
  returning * into v_order;

  insert into public.order_items (order_id, product_id, seller_account_id, title_snapshot, license_type_snapshot,
    unit_price_centavos, commission_bps, platform_fee_centavos, seller_earnings_centavos)
  values (v_order.id, p_product_id, v_seller, v_title, v_license, v_price, v_bps,
    round(v_price * v_bps / 10000.0)::integer, v_price - round(v_price * v_bps / 10000.0)::integer);

  return query select v_order.id, v_order.order_number, v_order.total_centavos;
end;
$$;

revoke all on function public.create_order_for_product(uuid) from public, anon;
grant execute on function public.create_order_for_product(uuid) to authenticated;
