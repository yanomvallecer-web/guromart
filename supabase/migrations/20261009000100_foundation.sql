-- GuroMart foundation: helpers, profiles, roles, taxonomy, settings, audit log.
-- Every table in `public` has row-level security enabled. Writes that must not
-- be trusted to the browser (orders, payments, entitlements, ledger) are done
-- by the server with the service role and have no client write policy.

create extension if not exists pg_trgm with schema extensions;

-- Helpers live in a schema PostgREST does not expose.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the request comes from a signed-in browser session rather than
-- the server (service_role) or a migration (postgres).
create or replace function private.is_client_request()
returns boolean
language sql
stable
as $$
  select current_user in ('authenticated', 'anon');
$$;

------------------------------------------------------------------------------
-- Profiles and roles
------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  school_name text check (school_name is null or char_length(school_name) <= 160),
  region text check (region is null or char_length(region) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Every account can buy. Extra capabilities are granted as roles.
create type public.app_role as enum ('seller', 'publisher', 'admin');

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function private.has_role(check_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = check_role
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin');
$$;

grant execute on function private.has_role(public.app_role), private.is_admin(),
  private.is_client_request() to anon, authenticated, service_role;

-- Create a profile for every new auth user.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "profiles: owner reads" on public.profiles
  for select to authenticated using (id = auth.uid() or private.is_admin());
create policy "profiles: owner updates" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "user_roles: owner or admin reads" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or private.is_admin());
-- Roles are granted by the server (seller onboarding) or by admins.
create policy "user_roles: admin manages" on public.user_roles
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

------------------------------------------------------------------------------
-- Taxonomy (reference data, editable by admins)
------------------------------------------------------------------------------

create table public.grade_levels (
  id smallint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z0-9-]+$'),
  name text not null,
  stage text not null check (stage in ('early', 'elementary', 'junior_high', 'senior_high')),
  sort_order smallint not null,
  is_active boolean not null default true
);

create table public.subjects (
  id smallint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z0-9-]+$'),
  name text not null,
  sort_order smallint not null default 100,
  is_active boolean not null default true
);

-- Resource types (DLL, worksheet, ...). Named product_categories so physical
-- goods and services can be added under a `kind` later.
create table public.product_categories (
  id smallint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z0-9-]+$'),
  name text not null,
  kind text not null default 'digital' check (kind in ('digital', 'physical', 'service')),
  sort_order smallint not null default 100,
  is_active boolean not null default true
);

create table public.curricula (
  id smallint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z0-9-]+$'),
  name text not null,
  description text,
  sort_order smallint not null default 100,
  is_active boolean not null default true
);

-- Schools use different calendars, so a period is a kind plus a number
-- (quarter 2, trimester 1, week 5) rather than one fixed list of quarters.
create table public.academic_periods (
  id smallint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z0-9-]+$'),
  name text not null,
  period_kind text not null check (period_kind in ('quarter', 'trimester', 'semester', 'term', 'week', 'lesson', 'whole_year')),
  sequence smallint check (sequence is null or sequence between 1 and 60),
  sort_order smallint not null default 100,
  is_active boolean not null default true
);

create table public.languages (
  code text primary key check (code ~ '^[a-z_]+$'),
  name text not null,
  sort_order smallint not null default 100
);

do $$
declare t text;
begin
  foreach t in array array['grade_levels', 'subjects', 'product_categories', 'curricula', 'academic_periods', 'languages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: anyone reads" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format('create policy "%s: admin manages" on public.%I for all to authenticated using (private.is_admin()) with check (private.is_admin())', t, t);
  end loop;
end;
$$;

insert into public.grade_levels (code, name, stage, sort_order) values
  ('nursery', 'Nursery', 'early', 1),
  ('kindergarten', 'Kindergarten', 'early', 2),
  ('grade-1', 'Grade 1', 'elementary', 3),
  ('grade-2', 'Grade 2', 'elementary', 4),
  ('grade-3', 'Grade 3', 'elementary', 5),
  ('grade-4', 'Grade 4', 'elementary', 6),
  ('grade-5', 'Grade 5', 'elementary', 7),
  ('grade-6', 'Grade 6', 'elementary', 8),
  ('grade-7', 'Grade 7', 'junior_high', 9),
  ('grade-8', 'Grade 8', 'junior_high', 10),
  ('grade-9', 'Grade 9', 'junior_high', 11),
  ('grade-10', 'Grade 10', 'junior_high', 12),
  ('grade-11', 'Grade 11', 'senior_high', 13),
  ('grade-12', 'Grade 12', 'senior_high', 14);

insert into public.subjects (code, name, sort_order) values
  ('english', 'English', 1),
  ('filipino', 'Filipino', 2),
  ('mathematics', 'Mathematics', 3),
  ('science', 'Science', 4),
  ('araling-panlipunan', 'Araling Panlipunan', 5),
  ('gmrc', 'GMRC / Values Education', 6),
  ('mapeh', 'MAPEH', 7),
  ('epp', 'EPP', 8),
  ('tle', 'TLE', 9),
  ('mother-tongue', 'Mother Tongue', 10),
  ('reading-literacy', 'Reading and Literacy', 11),
  ('makabansa', 'Makabansa', 12),
  ('shs-core', 'Senior High Core Subjects', 13),
  ('shs-applied', 'Senior High Applied and Specialized', 14),
  ('classroom-management', 'Classroom Management', 15),
  ('other', 'Other', 99);

insert into public.product_categories (code, name, sort_order) values
  ('daily-lesson-log', 'Daily Lesson Logs', 1),
  ('lesson-plan', 'Detailed Lesson Plans', 2),
  ('worksheet', 'Worksheets', 3),
  ('activity-sheet', 'Activity Sheets', 4),
  ('presentation', 'PowerPoint Presentations', 5),
  ('assessment', 'Assessments', 6),
  ('learning-module', 'Learning Modules', 7),
  ('teaching-guide', 'Teaching Guides', 8),
  ('flashcards', 'Flashcards', 9),
  ('printable', 'Classroom Printables', 10),
  ('educational-game', 'Educational Games', 11),
  ('rubric', 'Rubrics', 12),
  ('classroom-decor', 'Classroom Decor', 13),
  ('planner', 'Planners and Forms', 14),
  ('intervention', 'Intervention and Remediation', 15);

insert into public.curricula (code, name, description, sort_order) values
  ('matatag', 'MATATAG Curriculum', 'DepEd MATATAG curriculum', 1),
  ('k-to-12', 'K to 12 (pre-MATATAG)', 'DepEd K to 12 Basic Education Curriculum', 2),
  ('private-school', 'Private school curriculum', 'School-specific or publisher curricula', 3),
  ('not-curriculum-specific', 'Not curriculum-specific', null, 99);

insert into public.academic_periods (code, name, period_kind, sequence, sort_order) values
  ('quarter-1', 'Quarter 1', 'quarter', 1, 1),
  ('quarter-2', 'Quarter 2', 'quarter', 2, 2),
  ('quarter-3', 'Quarter 3', 'quarter', 3, 3),
  ('quarter-4', 'Quarter 4', 'quarter', 4, 4),
  ('trimester-1', 'Trimester 1', 'trimester', 1, 11),
  ('trimester-2', 'Trimester 2', 'trimester', 2, 12),
  ('trimester-3', 'Trimester 3', 'trimester', 3, 13),
  ('semester-1', 'Semester 1', 'semester', 1, 21),
  ('semester-2', 'Semester 2', 'semester', 2, 22),
  ('whole-year', 'Whole school year', 'whole_year', null, 90);

insert into public.languages (code, name, sort_order) values
  ('en', 'English', 1),
  ('fil', 'Filipino', 2),
  ('en_fil', 'English and Filipino', 3),
  ('mother_tongue', 'Mother tongue', 4),
  ('other', 'Other', 99);

------------------------------------------------------------------------------
-- Platform settings (commission plans, payout rules)
------------------------------------------------------------------------------

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  description text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function private.set_updated_at();

alter table public.platform_settings enable row level security;
create policy "platform_settings: anyone reads" on public.platform_settings
  for select to anon, authenticated using (true);
create policy "platform_settings: admin manages" on public.platform_settings
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Values from the GuroMart business model draft (Oct 2026). Rates are basis points.
insert into public.platform_settings (key, value, description) values
  ('commission.starter_bps', '3000', 'Platform commission on the free Starter plan (seller keeps 70%)'),
  ('commission.pro_bps', '1500', 'Platform commission on the Pro plan (seller keeps 85%)'),
  ('pricing.min_paid_price_centavos', '3000', 'Lowest allowed price for a paid item (PHP 30); free items are allowed'),
  ('payouts.minimum_centavos', '50000', 'Minimum balance for a seller payout (PHP 500)'),
  ('payouts.hold_days', '7', 'Days earnings are held before they can be paid out'),
  ('uploads.max_file_bytes', '104857600', 'Largest resource file a seller can upload (100 MB)');

------------------------------------------------------------------------------
-- Audit log (append-only; written through private.audit)
------------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) <= 80),
  entity_type text not null check (char_length(entity_type) <= 60),
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

alter table public.audit_logs enable row level security;
create policy "audit_logs: admin reads" on public.audit_logs
  for select to authenticated using (private.is_admin());

create or replace function private.audit(
  p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

revoke all on function private.audit(text, text, text, jsonb) from public;
grant execute on function private.audit(text, text, text, jsonb) to authenticated, service_role;

-- Changing anyone's roles is always audited.
create or replace function private.audit_user_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit('role.granted', 'user', new.user_id::text, jsonb_build_object('role', new.role));
    return new;
  else
    perform private.audit('role.revoked', 'user', old.user_id::text, jsonb_build_object('role', old.role));
    return old;
  end if;
end;
$$;

create trigger user_roles_audit after insert or delete on public.user_roles
  for each row execute function private.audit_user_roles();
