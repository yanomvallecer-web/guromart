-- Checkout. The buyer's cart becomes an order with price and commission
-- snapshots; the server opens a PayMongo checkout for it. Access is granted
-- only by apply_payment_event(), which the server calls after verifying a
-- PayMongo webhook signature. A redirect back from the checkout page never
-- grants anything.

-- Platform commission for a seller: a negotiated override, else the plan rate.
create or replace function private.commission_bps_for(p_seller_account_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    a.commission_bps_override,
    (select (value #>> '{}')::integer from public.platform_settings
     where key = case when a.plan = 'starter' then 'commission.starter_bps' else 'commission.pro_bps' end)
  )
  from public.seller_accounts a where a.id = p_seller_account_id;
$$;

-- What a buyer's cart can be charged for right now, at current prices.
create or replace function private.checkout_lines(p_user uuid)
returns table (product_id uuid, seller_account_id uuid, title text, license public.license_type, price integer, bps integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, s.seller_account_id, p.title, p.license_type, p.price_centavos, private.commission_bps_for(s.seller_account_id)
  from public.carts c
  join public.cart_items i on i.cart_id = c.id
  join public.products p on p.id = i.product_id
  join public.storefronts s on s.id = p.storefront_id
  where c.user_id = p_user and private.cart_item_problem(p.id) is null;
$$;

revoke all on function private.checkout_lines(uuid) from public;

-- Turns the caller's cart into an order awaiting payment. Items that can no
-- longer be bought (unpublished, now free, already owned) are left out.
create or replace function public.create_order_from_cart()
returns table (order_id uuid, order_number text, total_centavos integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_order public.orders%rowtype;
  v_total integer;
  v_missing_rate boolean;
begin
  if v_user is null then
    raise exception 'Sign in to check out' using errcode = '42501';
  end if;

  select coalesce(sum(price), 0), bool_or(bps is null) into v_total, v_missing_rate from private.checkout_lines(v_user);
  if v_total = 0 then
    raise exception 'Your cart has nothing to pay for' using errcode = '22023';
  end if;
  if v_missing_rate then
    raise exception 'A seller''s commission rate is missing' using errcode = '22023';
  end if;

  insert into public.orders (user_id, subtotal_centavos, total_centavos, payment_provider)
  values (v_user, v_total, v_total, 'paymongo')
  returning * into v_order;

  insert into public.order_items (order_id, product_id, seller_account_id, title_snapshot, license_type_snapshot,
    unit_price_centavos, commission_bps, platform_fee_centavos, seller_earnings_centavos)
  select v_order.id, l.product_id, l.seller_account_id, l.title, l.license, l.price, l.bps,
    round(l.price * l.bps / 10000.0)::integer, l.price - round(l.price * l.bps / 10000.0)::integer
  from private.checkout_lines(v_user) l;

  return query select v_order.id, v_order.order_number, v_order.total_centavos;
end;
$$;

revoke all on function public.create_order_from_cart() from public, anon;
grant execute on function public.create_order_from_cart() to authenticated;

-- Applies one verified PayMongo webhook event. Idempotent: each event id is
-- stored once, and a payment is only marked paid once. Called by the server
-- with the service role after checking the signature.
create or replace function public.apply_payment_event(
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_livemode boolean,
  p_checkout_id text,
  p_payment_id text,
  p_amount integer,
  p_fee integer,
  p_method text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_item record;
  v_hold integer;
  v_outcome text;
begin
  insert into public.payment_events (provider, provider_event_id, event_type, payload, livemode)
  values ('paymongo', p_event_id, p_event_type, p_payload, coalesce(p_livemode, false))
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';
  end if;

  if p_event_type <> 'checkout_session.payment.paid' then
    update public.payment_events set processed_at = now() where id = v_event;
    return 'ignored';
  end if;

  select * into v_payment from public.payments where provider_checkout_id = p_checkout_id for update;
  if not found then
    update public.payment_events set processed_at = now(), processing_error = 'Unknown checkout session' where id = v_event;
    return 'unknown_checkout';
  end if;
  if v_payment.status = 'paid' then
    update public.payment_events set processed_at = now() where id = v_event;
    return 'already_paid';
  end if;
  if p_amount is distinct from v_payment.amount_centavos or v_payment.livemode is distinct from coalesce(p_livemode, false) then
    update public.payment_events set processed_at = now(),
      processing_error = format('Paid %s (livemode %s) does not match expected %s (livemode %s)', p_amount, p_livemode, v_payment.amount_centavos, v_payment.livemode)
    where id = v_event;
    perform private.audit('payment.mismatch', 'order', v_payment.order_id::text,
      jsonb_build_object('event_id', p_event_id, 'amount', p_amount, 'expected', v_payment.amount_centavos));
    return 'mismatch';
  end if;

  select * into v_order from public.orders where id = v_payment.order_id for update;
  select (value #>> '{}')::integer into v_hold from public.platform_settings where key = 'payouts.hold_days';

  update public.payments
  set status = 'paid', provider_payment_id = p_payment_id, fee_centavos = p_fee, payment_method = p_method
  where id = v_payment.id;
  update public.orders set status = 'paid', paid_at = now() where id = v_order.id;

  v_outcome := 'paid';
  for v_item in select * from public.order_items where order_id = v_order.id loop
    insert into public.entitlements (user_id, product_id, order_item_id, source)
    values (v_order.user_id, v_item.product_id, v_item.id, 'purchase')
    on conflict (user_id, product_id) do nothing;
    if not found then
      -- Paid twice for the same resource (e.g. two checkout tabs). Staff refund it.
      perform private.audit('order.duplicate_purchase', 'order', v_order.id::text,
        jsonb_build_object('order_item_id', v_item.id, 'product_id', v_item.product_id));
      v_outcome := 'paid_with_duplicates';
    end if;

    insert into public.seller_ledger_entries (seller_account_id, entry_type, amount_centavos, order_item_id, description, available_at)
    values (v_item.seller_account_id, 'sale', v_item.seller_earnings_centavos, v_item.id,
      left(format('Sale of "%s" (%s)', v_item.title_snapshot, v_order.order_number), 500),
      now() + make_interval(days => coalesce(v_hold, 7)));

    update public.products set sales_count = sales_count + 1 where id = v_item.product_id;
    delete from public.cart_items ci using public.carts c
    where c.id = ci.cart_id and c.user_id = v_order.user_id and ci.product_id = v_item.product_id;
  end loop;

  insert into public.notifications (user_id, type, title, body, link_path)
  values (v_order.user_id, 'order.paid', 'Payment received',
    format('Order %s is paid. Your resources are in your library.', v_order.order_number), '/library');

  insert into public.notifications (user_id, type, title, body, link_path)
  select a.user_id, 'sale.made', 'You made a sale',
    left(format('%s sold in order %s.', string_agg('"' || i.title_snapshot || '"', ', '), v_order.order_number), 1000),
    '/seller'
  from public.order_items i join public.seller_accounts a on a.id = i.seller_account_id
  where i.order_id = v_order.id
  group by a.user_id;

  perform private.audit('order.paid', 'order', v_order.id::text,
    jsonb_build_object('event_id', p_event_id, 'payment_id', p_payment_id, 'amount', p_amount, 'method', p_method));
  update public.payment_events set processed_at = now() where id = v_event;
  return v_outcome;
end;
$$;

revoke all on function public.apply_payment_event(text, text, jsonb, boolean, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.apply_payment_event(text, text, jsonb, boolean, text, text, integer, integer, text) to service_role;
