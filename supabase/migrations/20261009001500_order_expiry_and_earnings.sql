-- Abandoned orders expire, failed payment attempts are recorded so the buyer
-- can be told, and sellers can see when held earnings become payable.
--
-- Expiry is lazy: the server calls expire_my_stale_orders() when a buyer
-- opens their orders or starts a checkout, so no scheduler or secret is
-- needed. Where pg_cron is installed, a schedule also sweeps every hour.
-- A payment that PayMongo confirms after its order expired is still applied:
-- the money was taken, so the buyer gets the resources and the seller is paid.

insert into public.platform_settings (key, value, description) values
  ('orders.pending_expiry_hours', '25', 'Hours an unpaid order waits before it expires (PayMongo checkout pages stay open for 24 hours; never less than 24)')
on conflict (key) do nothing;

-- PayMongo reports a failed attempt on the payment intent behind a checkout
-- session, so the intent id is kept to match payment.failed events.
alter table public.payments add column if not exists provider_payment_intent_id text unique;

------------------------------------------------------------------------------
-- Expiring abandoned orders
------------------------------------------------------------------------------

-- Expires one buyer's unpaid orders (or everyone's, with null) that are older
-- than the cutoff. Idempotent. Payments are updated before orders, the same
-- lock order as apply_payment_event, so a webhook arriving at the same moment
-- waits instead of deadlocking, then applies the payment as a late payment.
create or replace function private.expire_stale_orders(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours integer;
  v_cutoff timestamptz;
  v_count integer;
begin
  select (value #>> '{}')::integer into v_hours from public.platform_settings where key = 'orders.pending_expiry_hours';
  v_cutoff := now() - make_interval(hours => greatest(coalesce(v_hours, 25), 24));

  update public.payments p set status = 'expired'
  from public.orders o
  where o.id = p.order_id and p.status = 'pending'
    and o.status = 'pending_payment' and o.created_at < v_cutoff
    and (p_user is null or o.user_id = p_user);

  update public.orders set status = 'expired'
  where status = 'pending_payment' and created_at < v_cutoff
    and (p_user is null or user_id = p_user);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.expire_stale_orders(uuid) from public, anon, authenticated;

-- The signed-in buyer's own stale orders. Safe to call on every page view.
create or replace function public.expire_my_stale_orders()
returns integer
language sql
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then 0 else private.expire_stale_orders(auth.uid()) end;
$$;

revoke all on function public.expire_my_stale_orders() from public, anon;
grant execute on function public.expire_my_stale_orders() to authenticated, service_role;

-- Hourly sweep, only where pg_cron is installed (not on the local test stack).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.schedule('guromart-expire-stale-orders', '17 * * * *', 'select private.expire_stale_orders(null)')$cron$;
  end if;
end;
$$;

------------------------------------------------------------------------------
-- Payment events: failed attempts and late payments
------------------------------------------------------------------------------

drop function if exists public.apply_payment_event(text, text, jsonb, boolean, text, text, integer, integer, text);

-- Applies one verified PayMongo webhook event. Idempotent: each event id is
-- stored once, and a payment is only marked paid once. Called by the server
-- with the service role after checking the signature.
--   checkout_session.payment.paid: grants access and credits sellers, also
--     when the order already expired (the buyer paid, so they get it).
--   payment.failed: records why the attempt failed so the order page can say
--     so. The order stays open: the buyer can still pay on the same page.
create or replace function public.apply_payment_event(
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_livemode boolean,
  p_checkout_id text,
  p_payment_id text,
  p_amount integer,
  p_fee integer,
  p_method text,
  p_payment_intent_id text default null,
  p_failure text default null
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

  if p_event_type = 'payment.failed' then
    select * into v_payment from public.payments where provider_payment_intent_id = p_payment_intent_id for update;
    if not found then
      update public.payment_events set processed_at = now(), processing_error = 'Unknown payment intent' where id = v_event;
      return 'unknown_payment';
    end if;
    if v_payment.status = 'paid' then
      update public.payment_events set processed_at = now() where id = v_event;
      return 'already_paid';
    end if;
    update public.payments
    set status = case when status = 'pending' then 'failed'::public.payment_status else status end,
      failure_reason = left(coalesce(nullif(trim(p_failure), ''), 'The payment did not go through.'), 500)
    where id = v_payment.id;
    update public.payment_events set processed_at = now() where id = v_event;
    return 'failed';
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

  -- Money was taken, so an order that already expired is still fulfilled.
  -- Staff can see these in the audit log.
  if v_order.status <> 'pending_payment' then
    perform private.audit('order.paid_late', 'order', v_order.id::text,
      jsonb_build_object('event_id', p_event_id, 'order_status', v_order.status, 'payment_status', v_payment.status));
  end if;

  update public.payments
  set status = 'paid', provider_payment_id = p_payment_id, fee_centavos = p_fee, payment_method = p_method, failure_reason = null
  where id = v_payment.id;
  update public.orders set status = 'paid', paid_at = now() where id = v_order.id;

  v_outcome := 'paid';
  for v_item in select * from public.order_items where order_id = v_order.id loop
    insert into public.entitlements (user_id, product_id, order_item_id, source)
    values (v_order.user_id, v_item.product_id, v_item.id, 'purchase')
    on conflict (user_id, product_id) do nothing;
    if not found then
      -- Paid twice for the same resource (e.g. two checkout tabs, or a late
      -- payment for an expired order after buying again). Staff refund it.
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
    '/seller/earnings'
  from public.order_items i join public.seller_accounts a on a.id = i.seller_account_id
  where i.order_id = v_order.id
  group by a.user_id;

  perform private.audit('order.paid', 'order', v_order.id::text,
    jsonb_build_object('event_id', p_event_id, 'payment_id', p_payment_id, 'amount', p_amount, 'method', p_method));
  update public.payment_events set processed_at = now() where id = v_event;
  return v_outcome;
end;
$$;

revoke all on function public.apply_payment_event(text, text, jsonb, boolean, text, text, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_payment_event(text, text, jsonb, boolean, text, text, integer, integer, text, text, text) to service_role;

------------------------------------------------------------------------------
-- Seller earnings
------------------------------------------------------------------------------

-- Held earnings by the day (Philippine time) they become payable. Reads the
-- ledger as the caller, so a seller only sees their own.
create or replace view public.seller_upcoming_releases
with (security_invoker = true)
as
select
  seller_account_id,
  (available_at at time zone 'Asia/Manila')::date as release_date,
  sum(amount_centavos)::bigint as amount_centavos,
  count(*) filter (where entry_type = 'sale')::integer as sales
from public.seller_ledger_entries
where available_at > now()
group by seller_account_id, (available_at at time zone 'Asia/Manila')::date;

revoke all on public.seller_upcoming_releases from anon;
grant select on public.seller_upcoming_releases to authenticated, service_role;
