-- The GuroMart helper (an AI chat for questions about buying and selling).
-- Conversations are not stored; only a per-person daily count, so the helper
-- can't be used to run up the API bill.

insert into public.platform_settings (key, value, description)
values ('assistant.daily_limit', '30', 'Questions one person can ask the GuroMart helper per day (Manila time)')
on conflict (key) do nothing;

create table public.assistant_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  questions integer not null default 0 check (questions >= 0),
  primary key (user_id, day)
);

-- No policies: only the functions below touch it.
alter table public.assistant_usage enable row level security;

-- Counts one question for the caller and returns how many they have left
-- today, or raises when the day's limit is used up.
create or replace function public.take_assistant_question()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Manila')::date;
  v_limit integer := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'assistant.daily_limit'), 30);
  v_used integer;
begin
  if v_user is null then
    raise exception 'Sign in to ask the GuroMart helper' using errcode = '42501';
  end if;
  insert into public.assistant_usage (user_id, day, questions) values (v_user, v_day, 1)
  on conflict (user_id, day) do update set questions = public.assistant_usage.questions + 1
  where public.assistant_usage.questions < v_limit
  returning questions into v_used;
  if v_used is null then
    raise exception 'You''ve reached today''s limit of % questions. Please try again tomorrow.', v_limit using errcode = '54000';
  end if;
  return v_limit - v_used;
end;
$$;

revoke all on function public.take_assistant_question() from public, anon;
grant execute on function public.take_assistant_question() to authenticated;

-- How many questions the caller has left today, for the page.
create or replace function public.assistant_questions_left()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0,
    coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'assistant.daily_limit'), 30)
    - coalesce((select questions from public.assistant_usage
        where user_id = auth.uid() and day = (now() at time zone 'Asia/Manila')::date), 0));
$$;

revoke all on function public.assistant_questions_left() from public, anon;
grant execute on function public.assistant_questions_left() to authenticated;
