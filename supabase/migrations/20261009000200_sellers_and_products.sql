-- Sellers, storefronts, verification, payout details, products and files.

create type public.seller_type as enum ('teacher', 'creator', 'publisher', 'school_supplier', 'institution');
create type public.seller_status as enum ('onboarding', 'active', 'suspended', 'closed');
create type public.seller_plan as enum ('starter', 'pro', 'partner');
create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');

create table public.seller_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete restrict,
  seller_type public.seller_type not null,
  status public.seller_status not null default 'onboarding',
  plan public.seller_plan not null default 'starter',
  -- Partner rates are negotiated; null means "use the plan's default".
  commission_bps_override integer check (commission_bps_override between 0 and 10000),
  founding_seller_until date,
  verification_status public.verification_status not null default 'unverified',
  legal_name text check (char_length(legal_name) <= 160),
  business_name text check (char_length(business_name) <= 160),
  tin text check (tin is null or tin ~ '^[0-9-]{9,17}$'),
  copyright_strikes smallint not null default 0 check (copyright_strikes >= 0),
  onboarding_step smallint not null default 2 check (onboarding_step between 1 and 8),
  agreed_to_seller_terms_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger seller_accounts_updated_at before update on public.seller_accounts
  for each row execute function private.set_updated_at();

create table public.storefronts (
  id uuid primary key default gen_random_uuid(),
  seller_account_id uuid not null unique references public.seller_accounts (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$'),
  name text not null check (char_length(name) between 2 and 80),
  tagline text check (char_length(tagline) <= 140),
  description text check (char_length(description) <= 4000),
  logo_path text,
  banner_path text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger storefronts_updated_at before update on public.storefronts
  for each row execute function private.set_updated_at();

create table public.seller_verifications (
  id uuid primary key default gen_random_uuid(),
  seller_account_id uuid not null references public.seller_accounts (id) on delete cascade,
  kind text not null check (kind in ('government_id', 'prc_license', 'business_registration', 'school_id', 'other')),
  document_path text not null,
  status public.verification_status not null default 'pending',
  reviewer_id uuid references auth.users (id) on delete set null,
  reviewer_notes text check (char_length(reviewer_notes) <= 2000),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index seller_verifications_seller_idx on public.seller_verifications (seller_account_id, submitted_at desc);
create index seller_verifications_pending_idx on public.seller_verifications (submitted_at) where status = 'pending';

-- Where a seller wants to be paid. Only the seller and admins can read it.
create table public.seller_payout_methods (
  id uuid primary key default gen_random_uuid(),
  seller_account_id uuid not null references public.seller_accounts (id) on delete cascade,
  method text not null check (method in ('gcash', 'maya', 'bank')),
  account_name text not null check (char_length(account_name) between 2 and 160),
  account_number text not null check (account_number ~ '^[0-9 -]{6,34}$'),
  bank_name text check (char_length(bank_name) <= 120),
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (method <> 'bank' or bank_name is not null)
);

create unique index seller_payout_methods_one_default on public.seller_payout_methods (seller_account_id) where is_default;

create trigger seller_payout_methods_updated_at before update on public.seller_payout_methods
  for each row execute function private.set_updated_at();

create or replace function private.current_seller_account_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.seller_accounts where user_id = auth.uid();
$$;

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

create or replace function private.storefront_is_live(p_storefront_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.storefronts s
    join public.seller_accounts a on a.id = s.seller_account_id
    where s.id = p_storefront_id and s.is_published and a.status = 'active'
  );
$$;

grant execute on function private.current_seller_account_id(), private.owns_storefront(uuid)
  to authenticated, service_role;
grant execute on function private.storefront_is_live(uuid) to anon, authenticated, service_role;

-- Sellers may edit their own profile fields but not status, plan, rates,
-- verification or strikes.
create or replace function private.guard_seller_account()
returns trigger
language plpgsql
as $$
begin
  if private.is_client_request() and not private.is_admin() then
    if new.user_id is distinct from old.user_id
      or new.status is distinct from old.status
      or new.plan is distinct from old.plan
      or new.commission_bps_override is distinct from old.commission_bps_override
      or new.founding_seller_until is distinct from old.founding_seller_until
      or new.verification_status is distinct from old.verification_status
      or new.copyright_strikes is distinct from old.copyright_strikes then
      raise exception 'Only GuroMart staff can change this seller field' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger seller_accounts_guard before update on public.seller_accounts
  for each row execute function private.guard_seller_account();

alter table public.seller_accounts enable row level security;
alter table public.storefronts enable row level security;
alter table public.seller_verifications enable row level security;
alter table public.seller_payout_methods enable row level security;

-- Seller accounts are created by the server during onboarding.
create policy "seller_accounts: owner or admin reads" on public.seller_accounts
  for select to authenticated using (user_id = auth.uid() or private.is_admin());
create policy "seller_accounts: owner or admin updates" on public.seller_accounts
  for update to authenticated
  using (user_id = auth.uid() or private.is_admin())
  with check (user_id = auth.uid() or private.is_admin());

create policy "storefronts: public reads published" on public.storefronts
  for select to anon, authenticated
  using (private.storefront_is_live(id) or seller_account_id = private.current_seller_account_id() or private.is_admin());
create policy "storefronts: owner updates" on public.storefronts
  for update to authenticated
  using (seller_account_id = private.current_seller_account_id() or private.is_admin())
  with check (seller_account_id = private.current_seller_account_id() or private.is_admin());

create policy "seller_verifications: owner or admin reads" on public.seller_verifications
  for select to authenticated
  using (seller_account_id = private.current_seller_account_id() or private.is_admin());
create policy "seller_verifications: owner submits" on public.seller_verifications
  for insert to authenticated
  with check (seller_account_id = private.current_seller_account_id() and status = 'pending' and reviewer_id is null);
create policy "seller_verifications: admin reviews" on public.seller_verifications
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "seller_payout_methods: owner or admin reads" on public.seller_payout_methods
  for select to authenticated
  using (seller_account_id = private.current_seller_account_id() or private.is_admin());
create policy "seller_payout_methods: owner manages" on public.seller_payout_methods
  for all to authenticated
  using (seller_account_id = private.current_seller_account_id())
  with check (seller_account_id = private.current_seller_account_id());

------------------------------------------------------------------------------
-- Products
------------------------------------------------------------------------------

create type public.product_status as enum ('draft', 'pending_review', 'published', 'rejected', 'suspended', 'archived');
create type public.license_type as enum ('single_teacher', 'multiple_teachers', 'school_site');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.storefronts (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,118}[a-z0-9])$'),
  title text not null check (char_length(title) between 4 and 160),
  summary text check (char_length(summary) <= 300),
  description text not null default '' check (char_length(description) <= 10000),
  kind text not null default 'digital' check (kind in ('digital', 'physical', 'service')),
  category_id smallint not null references public.product_categories (id),
  subject_id smallint references public.subjects (id),
  curriculum_id smallint references public.curricula (id),
  academic_period_id smallint references public.academic_periods (id),
  period_detail text check (char_length(period_detail) <= 80),
  topic text check (char_length(topic) <= 200),
  learning_competency text check (char_length(learning_competency) <= 1000),
  language_code text references public.languages (code),
  price_centavos integer not null default 0 check (price_centavos >= 0 and price_centavos <= 10000000),
  currency char(3) not null default 'PHP' check (currency = 'PHP'),
  page_count integer check (page_count is null or page_count between 1 and 5000),
  is_editable boolean not null default false,
  license_type public.license_type not null default 'single_teacher',
  license_terms text check (char_length(license_terms) <= 4000),
  copyright_declared_at timestamptz,
  status public.product_status not null default 'draft',
  rejection_reason text check (char_length(rejection_reason) <= 2000),
  published_at timestamptz,
  -- Maintained by the server and triggers, never by sellers.
  rating_avg numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  sales_count integer not null default 0,
  download_count integer not null default 0,
  is_featured boolean not null default false,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(topic, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(learning_competency, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'D')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Paid items must cost at least PHP 30 (business rule); free items are 0.
  check (price_centavos = 0 or price_centavos >= 3000),
  check (status not in ('pending_review', 'published') or copyright_declared_at is not null)
);

create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

create index products_storefront_idx on public.products (storefront_id, created_at desc);
create index products_published_new_idx on public.products (published_at desc) where status = 'published';
create index products_published_popular_idx on public.products (sales_count desc, published_at desc) where status = 'published';
create index products_category_idx on public.products (category_id) where status = 'published';
create index products_subject_idx on public.products (subject_id) where status = 'published';
create index products_curriculum_idx on public.products (curriculum_id) where status = 'published';
create index products_price_idx on public.products (price_centavos) where status = 'published';
create index products_rating_idx on public.products (rating_avg desc) where status = 'published';
create index products_search_idx on public.products using gin (search_vector);
create index products_title_trgm_idx on public.products using gin (title extensions.gin_trgm_ops);
create index products_pending_idx on public.products (updated_at) where status = 'pending_review';

-- A resource often covers several grades.
create table public.product_grade_levels (
  product_id uuid not null references public.products (id) on delete cascade,
  grade_level_id smallint not null references public.grade_levels (id),
  primary key (product_id, grade_level_id)
);

create index product_grade_levels_grade_idx on public.product_grade_levels (grade_level_id, product_id);

create type public.scan_status as enum ('pending', 'clean', 'infected', 'failed');

-- Private resource files. The browser never gets a storage URL for these;
-- downloads go through the server, which checks entitlement and signs a
-- short-lived URL.
create table public.product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'image/png', 'image/jpeg', 'image/webp'
  )),
  file_format text not null check (file_format in ('pdf', 'docx', 'pptx', 'xlsx', 'zip', 'png', 'jpg', 'webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  scan_status public.scan_status not null default 'pending',
  scanned_at timestamptz,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index product_files_product_idx on public.product_files (product_id, sort_order);
create index product_files_format_idx on public.product_files (file_format, product_id);

-- Public preview images (watermarked thumbnails, first pages).
create table public.product_previews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null unique,
  alt_text text check (char_length(alt_text) <= 200),
  width integer,
  height integer,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index product_previews_product_idx on public.product_previews (product_id, sort_order);

create or replace function private.owns_product(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.products p
    join public.storefronts s on s.id = p.storefront_id
    join public.seller_accounts a on a.id = s.seller_account_id
    where p.id = p_product_id and a.user_id = auth.uid()
  );
$$;

create or replace function private.product_is_public(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.products p
    where p.id = p_product_id and p.status = 'published' and private.storefront_is_live(p.storefront_id)
  );
$$;

grant execute on function private.owns_product(uuid), private.product_is_public(uuid)
  to anon, authenticated, service_role;

-- Sellers move their products between draft, pending_review and archived.
-- Publishing, rejecting, suspending and system counters belong to staff.
create or replace function private.guard_product()
returns trigger
language plpgsql
as $$
begin
  if private.is_client_request() and not private.is_admin() then
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'pending_review') then
        raise exception 'New products start as a draft or go to review' using errcode = '42501';
      end if;
      new.rating_avg := 0; new.rating_count := 0; new.sales_count := 0;
      new.download_count := 0; new.is_featured := false; new.published_at := null;
      new.rejection_reason := null;
      return new;
    end if;

    if new.storefront_id is distinct from old.storefront_id
      or new.rating_avg is distinct from old.rating_avg
      or new.rating_count is distinct from old.rating_count
      or new.sales_count is distinct from old.sales_count
      or new.download_count is distinct from old.download_count
      or new.is_featured is distinct from old.is_featured
      or new.published_at is distinct from old.published_at
      or new.rejection_reason is distinct from old.rejection_reason then
      raise exception 'Only GuroMart staff can change this product field' using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      if old.status = 'suspended' or new.status not in ('draft', 'pending_review', 'archived') then
        raise exception 'Sellers cannot move a product from % to %', old.status, new.status using errcode = '42501';
      end if;
    elsif old.status = 'published' then
      -- Editing a live listing sends it back to review.
      new.status := 'pending_review';
    end if;
  end if;

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger products_guard before insert or update on public.products
  for each row execute function private.guard_product();

alter table public.products enable row level security;
alter table public.product_grade_levels enable row level security;
alter table public.product_files enable row level security;
alter table public.product_previews enable row level security;

-- Policies on products test the row's own columns: a lookup by id would not
-- see a row being inserted in the same statement.
create policy "products: public reads published" on public.products
  for select to anon, authenticated
  using ((status = 'published' and private.storefront_is_live(storefront_id))
    or private.owns_storefront(storefront_id) or private.is_admin());
create policy "products: owner creates" on public.products
  for insert to authenticated
  with check (private.owns_storefront(storefront_id));
create policy "products: owner or admin updates" on public.products
  for update to authenticated
  using (private.owns_storefront(storefront_id) or private.is_admin())
  with check (private.owns_storefront(storefront_id) or private.is_admin());
create policy "products: owner deletes drafts" on public.products
  for delete to authenticated
  using (private.owns_storefront(storefront_id) and status = 'draft');

create policy "product_grade_levels: follows product" on public.product_grade_levels
  for select to anon, authenticated
  using (private.product_is_public(product_id) or private.owns_product(product_id) or private.is_admin());
create policy "product_grade_levels: owner manages" on public.product_grade_levels
  for all to authenticated
  using (private.owns_product(product_id)) with check (private.owns_product(product_id));

-- File metadata is visible to the owner and admins only. Buyers see formats
-- and sizes through a server query, never storage paths.
create policy "product_files: owner or admin reads" on public.product_files
  for select to authenticated using (private.owns_product(product_id) or private.is_admin());
create policy "product_files: owner adds" on public.product_files
  for insert to authenticated
  with check (private.owns_product(product_id) and scan_status = 'pending');
create policy "product_files: owner removes" on public.product_files
  for delete to authenticated using (private.owns_product(product_id));
create policy "product_files: admin updates scan" on public.product_files
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "product_previews: follows product" on public.product_previews
  for select to anon, authenticated
  using (private.product_is_public(product_id) or private.owns_product(product_id) or private.is_admin());
create policy "product_previews: owner manages" on public.product_previews
  for all to authenticated
  using (private.owns_product(product_id)) with check (private.owns_product(product_id));

-- Moderation decisions are audited.
create or replace function private.audit_product_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform private.audit('product.status_changed', 'product', new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.rejection_reason));
  end if;
  return new;
end;
$$;

create trigger products_audit_status after update on public.products
  for each row execute function private.audit_product_status();
