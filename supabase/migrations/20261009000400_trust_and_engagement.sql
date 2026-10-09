-- Reviews, wishlists, notifications, copyright reports and support tickets.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 2000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create trigger reviews_updated_at before update on public.reviews
  for each row execute function private.set_updated_at();

create index reviews_product_idx on public.reviews (product_id, created_at desc) where status = 'published';

-- Keep the product's rating summary in step with its published reviews.
create or replace function private.refresh_product_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating_avg = coalesce(r.avg_rating, 0),
    rating_count = coalesce(r.n, 0)
  from (
    select round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as n
    from public.reviews where product_id = pid and status = 'published'
  ) r
  where p.id = pid;
  return null;
end;
$$;

create trigger reviews_refresh_rating after insert or update or delete on public.reviews
  for each row execute function private.refresh_product_rating();

-- Buyers may only edit the content of their own review, not hide/unhide it.
create or replace function private.guard_review()
returns trigger
language plpgsql
as $$
begin
  if private.is_client_request() and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'published';
    elsif new.status is distinct from old.status or new.product_id is distinct from old.product_id
      or new.user_id is distinct from old.user_id then
      raise exception 'Only GuroMart staff can change this review field' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger reviews_guard before insert or update on public.reviews
  for each row execute function private.guard_review();

create table public.wishlists (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (char_length(type) <= 60),
  title text not null check (char_length(title) <= 160),
  body text check (char_length(body) <= 1000),
  link_path text check (link_path is null or link_path ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create type public.report_status as enum ('submitted', 'under_review', 'upheld', 'dismissed', 'withdrawn');

-- Copyright complaints can come from anyone, signed in or not (the server
-- inserts anonymous reports after rate limiting).
create table public.copyright_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  reporter_user_id uuid references auth.users (id) on delete set null,
  reporter_name text not null check (char_length(reporter_name) between 2 and 160),
  reporter_email text not null check (reporter_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  reporter_role text not null check (reporter_role in ('rights_owner', 'authorized_agent', 'other')),
  original_work_description text not null check (char_length(original_work_description) between 10 and 4000),
  evidence_url text check (evidence_url is null or evidence_url ~* '^https?://'),
  statement_good_faith boolean not null check (statement_good_faith),
  status public.report_status not null default 'submitted',
  resolution_notes text check (char_length(resolution_notes) <= 4000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger copyright_reports_updated_at before update on public.copyright_reports
  for each row execute function private.set_updated_at();

create index copyright_reports_product_idx on public.copyright_reports (product_id);
create index copyright_reports_open_idx on public.copyright_reports (created_at) where status in ('submitted', 'under_review');

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  category text not null check (category in ('order', 'download', 'account', 'selling', 'payout', 'other')),
  subject text not null check (char_length(subject) between 4 and 160),
  body text not null check (char_length(body) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'pending_user', 'resolved', 'closed')),
  assigned_to uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function private.set_updated_at();

create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_open_idx on public.support_tickets (created_at) where status in ('open', 'pending_user');

alter table public.reviews enable row level security;
alter table public.wishlists enable row level security;
alter table public.notifications enable row level security;
alter table public.copyright_reports enable row level security;
alter table public.support_tickets enable row level security;

create policy "reviews: public reads published" on public.reviews
  for select to anon, authenticated
  using ((status = 'published' and private.product_is_public(product_id)) or user_id = auth.uid() or private.is_admin());
-- Only buyers who own the resource can review it, which keeps reviews real.
create policy "reviews: entitled buyer writes" on public.reviews
  for insert to authenticated
  with check (user_id = auth.uid() and private.has_entitlement(product_id) and not private.owns_product(product_id));
create policy "reviews: author or admin updates" on public.reviews
  for update to authenticated
  using (user_id = auth.uid() or private.is_admin())
  with check (user_id = auth.uid() or private.is_admin());
create policy "reviews: author or admin deletes" on public.reviews
  for delete to authenticated using (user_id = auth.uid() or private.is_admin());

create policy "wishlists: owner manages" on public.wishlists
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notifications: owner reads" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications: owner marks read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "copyright_reports: reporter or admin reads" on public.copyright_reports
  for select to authenticated using (reporter_user_id = auth.uid() or private.is_admin());
create policy "copyright_reports: signed-in user submits" on public.copyright_reports
  for insert to authenticated
  with check (reporter_user_id = auth.uid() and status = 'submitted' and reviewed_by is null);
create policy "copyright_reports: admin reviews" on public.copyright_reports
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "support_tickets: owner or admin reads" on public.support_tickets
  for select to authenticated using (user_id = auth.uid() or private.is_admin());
create policy "support_tickets: owner opens" on public.support_tickets
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'open' and assigned_to is null);
create policy "support_tickets: admin updates" on public.support_tickets
  for update to authenticated using (private.is_admin()) with check (private.is_admin());
