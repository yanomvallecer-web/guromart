-- Carts, orders, payments, refunds, entitlements, downloads, seller ledger, payouts.
-- Only the server (service role) writes orders, payments, entitlements and
-- ledger rows. Browsers can read their own records and nothing else.

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger carts_updated_at before update on public.carts
  for each row execute function private.set_updated_at();

-- Digital items have quantity 1; the price is read at checkout, not stored here.
create table public.cart_items (
  cart_id uuid not null references public.carts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (cart_id, product_id)
);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

create policy "carts: owner manages" on public.carts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cart_items: owner manages" on public.cart_items
  for all to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid())
    and private.product_is_public(product_id)
  );

------------------------------------------------------------------------------
-- Orders
------------------------------------------------------------------------------

create type public.order_status as enum ('pending_payment', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'partially_refunded');

create sequence public.order_number_seq start 100001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('GM-' || nextval('public.order_number_seq')::text),
  user_id uuid not null references auth.users (id) on delete restrict,
  status public.order_status not null default 'pending_payment',
  currency char(3) not null default 'PHP' check (currency = 'PHP'),
  subtotal_centavos integer not null check (subtotal_centavos >= 0),
  discount_centavos integer not null default 0 check (discount_centavos >= 0),
  total_centavos integer not null check (total_centavos >= 0),
  refunded_centavos integer not null default 0 check (refunded_centavos >= 0),
  payment_provider text check (payment_provider in ('paymongo', 'free')),
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_centavos = subtotal_centavos - discount_centavos),
  check (refunded_centavos <= total_centavos)
);

create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);

-- Snapshot of what was bought and how the money splits.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  seller_account_id uuid not null references public.seller_accounts (id) on delete restrict,
  title_snapshot text not null,
  license_type_snapshot public.license_type not null,
  unit_price_centavos integer not null check (unit_price_centavos >= 0),
  commission_bps integer not null check (commission_bps between 0 and 10000),
  platform_fee_centavos integer not null check (platform_fee_centavos >= 0),
  seller_earnings_centavos integer not null check (seller_earnings_centavos >= 0),
  refunded_centavos integer not null default 0 check (refunded_centavos >= 0),
  created_at timestamptz not null default now(),
  unique (order_id, product_id),
  check (platform_fee_centavos + seller_earnings_centavos = unit_price_centavos),
  check (refunded_centavos <= unit_price_centavos)
);

create index order_items_seller_idx on public.order_items (seller_account_id, created_at desc);
create index order_items_product_idx on public.order_items (product_id);

------------------------------------------------------------------------------
-- Payments (provider records) and webhook idempotency
------------------------------------------------------------------------------

create type public.payment_status as enum ('pending', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  provider text not null check (provider in ('paymongo')),
  provider_checkout_id text unique,
  provider_payment_id text unique,
  payment_method text,
  status public.payment_status not null default 'pending',
  amount_centavos integer not null check (amount_centavos > 0),
  fee_centavos integer check (fee_centavos >= 0),
  failure_reason text,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();

create index payments_order_idx on public.payments (order_id);

-- Every verified webhook event is stored once. The unique key makes
-- processing idempotent when the provider retries.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  livemode boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (provider, provider_event_id)
);

------------------------------------------------------------------------------
-- Refunds and disputes
------------------------------------------------------------------------------

create type public.refund_status as enum ('requested', 'approved', 'rejected', 'processing', 'completed', 'failed');

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  order_item_id uuid references public.order_items (id) on delete restrict,
  amount_centavos integer not null check (amount_centavos > 0),
  reason text not null check (char_length(reason) between 5 and 2000),
  status public.refund_status not null default 'requested',
  provider_refund_id text unique,
  requested_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decision_notes text check (char_length(decision_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger refunds_updated_at before update on public.refunds
  for each row execute function private.set_updated_at();

create index refunds_order_idx on public.refunds (order_id);
create index refunds_open_idx on public.refunds (created_at) where status in ('requested', 'approved', 'processing');

create type public.dispute_status as enum ('open', 'awaiting_seller', 'awaiting_buyer', 'resolved_buyer', 'resolved_seller', 'closed');

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  order_item_id uuid references public.order_items (id) on delete restrict,
  opened_by uuid not null references auth.users (id) on delete restrict,
  reason text not null check (reason in ('not_as_described', 'file_broken', 'not_received', 'copyright', 'duplicate_charge', 'other')),
  details text not null check (char_length(details) between 10 and 4000),
  status public.dispute_status not null default 'open',
  resolution text check (char_length(resolution) <= 4000),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger disputes_updated_at before update on public.disputes
  for each row execute function private.set_updated_at();

create index disputes_open_idx on public.disputes (created_at) where status not in ('resolved_buyer', 'resolved_seller', 'closed');

------------------------------------------------------------------------------
-- Entitlements and downloads
------------------------------------------------------------------------------

-- The right to download a product. Created only after a verified payment
-- (or a free "get"), revoked on refund or takedown.
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  order_item_id uuid references public.order_items (id) on delete restrict,
  source text not null check (source in ('purchase', 'free', 'grant')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  unique (user_id, product_id),
  check (source <> 'purchase' or order_item_id is not null)
);

create index entitlements_product_idx on public.entitlements (product_id);

create table public.downloads (
  id bigint generated always as identity primary key,
  entitlement_id uuid not null references public.entitlements (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_file_id uuid not null references public.product_files (id) on delete cascade,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index downloads_user_idx on public.downloads (user_id, created_at desc);
create index downloads_file_idx on public.downloads (product_file_id, created_at desc);

create or replace function private.has_entitlement(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements
    where user_id = auth.uid() and product_id = p_product_id and revoked_at is null
  );
$$;

grant execute on function private.has_entitlement(uuid) to authenticated, service_role;

------------------------------------------------------------------------------
-- Seller ledger and payouts
------------------------------------------------------------------------------

create type public.ledger_entry_type as enum ('sale', 'refund', 'payout', 'payout_reversal', 'adjustment');

-- Append-only. A seller's balance is the sum of their entries. Sales become
-- payable after the hold period (available_at).
create table public.seller_ledger_entries (
  id bigint generated always as identity primary key,
  seller_account_id uuid not null references public.seller_accounts (id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  amount_centavos integer not null check (amount_centavos <> 0),
  order_item_id uuid references public.order_items (id) on delete restrict,
  refund_id uuid references public.refunds (id) on delete restrict,
  payout_id uuid,
  description text,
  available_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (entry_type <> 'sale' or (order_item_id is not null and amount_centavos > 0)),
  check (entry_type <> 'refund' or (refund_id is not null and amount_centavos < 0)),
  check (entry_type <> 'payout' or (payout_id is not null and amount_centavos < 0))
);

create unique index seller_ledger_one_sale_per_item on public.seller_ledger_entries (order_item_id) where entry_type = 'sale';
create unique index seller_ledger_one_entry_per_refund on public.seller_ledger_entries (refund_id) where entry_type = 'refund';
create index seller_ledger_seller_idx on public.seller_ledger_entries (seller_account_id, created_at desc);

create or replace function private.forbid_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Ledger entries are append-only; post an adjustment instead' using errcode = '42501';
end;
$$;

create trigger seller_ledger_append_only before update or delete on public.seller_ledger_entries
  for each row execute function private.forbid_ledger_mutation();

create type public.payout_status as enum ('pending', 'processing', 'paid', 'failed', 'cancelled');

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  seller_account_id uuid not null references public.seller_accounts (id) on delete restrict,
  amount_centavos integer not null check (amount_centavos > 0),
  status public.payout_status not null default 'pending',
  method text not null check (method in ('gcash', 'maya', 'bank')),
  destination_snapshot jsonb not null,
  provider_reference text,
  failure_reason text,
  period_start date,
  period_end date,
  created_by uuid references auth.users (id) on delete set null,
  processed_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seller_ledger_entries
  add constraint seller_ledger_payout_fk foreign key (payout_id) references public.payouts (id) on delete restrict;

create trigger payouts_updated_at before update on public.payouts
  for each row execute function private.set_updated_at();

create index payouts_seller_idx on public.payouts (seller_account_id, created_at desc);
create index payouts_open_idx on public.payouts (created_at) where status in ('pending', 'processing');

create or replace view public.seller_balances
with (security_invoker = true)
as
select
  seller_account_id,
  coalesce(sum(amount_centavos), 0)::bigint as balance_centavos,
  coalesce(sum(amount_centavos) filter (where available_at <= now()), 0)::bigint as available_centavos,
  coalesce(sum(amount_centavos) filter (where entry_type = 'sale'), 0)::bigint as lifetime_earnings_centavos
from public.seller_ledger_entries
group by seller_account_id;

------------------------------------------------------------------------------
-- RLS
------------------------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
alter table public.disputes enable row level security;
alter table public.entitlements enable row level security;
alter table public.downloads enable row level security;
alter table public.seller_ledger_entries enable row level security;
alter table public.payouts enable row level security;

create policy "orders: buyer or admin reads" on public.orders
  for select to authenticated using (user_id = auth.uid() or private.is_admin());

create policy "order_items: buyer, seller or admin reads" on public.order_items
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
    or seller_account_id = private.current_seller_account_id()
    or private.is_admin()
  );

create policy "payments: buyer or admin reads" on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()) or private.is_admin());

create policy "payment_events: admin reads" on public.payment_events
  for select to authenticated using (private.is_admin());

create policy "refunds: buyer or admin reads" on public.refunds
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()) or private.is_admin());

create policy "disputes: parties or admin read" on public.disputes
  for select to authenticated
  using (
    opened_by = auth.uid()
    or exists (select 1 from public.order_items i where i.id = order_item_id and i.seller_account_id = private.current_seller_account_id())
    or private.is_admin()
  );
create policy "disputes: buyer opens on own order" on public.disputes
  for insert to authenticated
  with check (
    opened_by = auth.uid() and status = 'open' and resolution is null and resolved_by is null
    and exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );
create policy "disputes: admin resolves" on public.disputes
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "entitlements: owner or admin reads" on public.entitlements
  for select to authenticated using (user_id = auth.uid() or private.is_admin());

create policy "downloads: owner or admin reads" on public.downloads
  for select to authenticated using (user_id = auth.uid() or private.is_admin());

create policy "seller_ledger: seller or admin reads" on public.seller_ledger_entries
  for select to authenticated
  using (seller_account_id = private.current_seller_account_id() or private.is_admin());

create policy "payouts: seller or admin reads" on public.payouts
  for select to authenticated
  using (seller_account_id = private.current_seller_account_id() or private.is_admin());
