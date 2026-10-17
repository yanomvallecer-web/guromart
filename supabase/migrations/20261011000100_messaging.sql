-- Buyer and seller messages. One conversation per teacher per shop; only the
-- two sides can read it. Either side can report a conversation, and GuroMart
-- staff can then read it to act on the report. New messages raise an in-app
-- notification for the other side.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  storefront_id uuid not null references public.storefronts (id) on delete cascade,
  -- The resource the teacher was looking at when they started the chat.
  product_id uuid references public.products (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  buyer_read_at timestamptz,
  seller_read_at timestamptz,
  reported_at timestamptz,
  reported_by uuid references auth.users (id) on delete set null,
  report_reason text check (char_length(report_reason) <= 1000),
  unique (buyer_id, storefront_id)
);

create index conversations_storefront_idx on public.conversations (storefront_id, last_message_at desc);
create index conversations_reported_idx on public.conversations (reported_at) where reported_at is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_sender_recent_idx on public.messages (sender_id, created_at desc);

create or replace function private.is_conversation_party(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.buyer_id = auth.uid() or private.owns_storefront(c.storefront_id))
  );
$$;

create or replace function private.can_read_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_conversation_party(p_conversation_id)
    or (private.is_admin() and exists (select 1 from public.conversations c where c.id = p_conversation_id and c.reported_at is not null));
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Conversations are created and changed only through the functions below.
create policy "conversations: parties and staff on reports read" on public.conversations
  for select to authenticated using (private.can_read_conversation(id));

create policy "messages: parties and staff on reports read" on public.messages
  for select to authenticated using (private.can_read_conversation(conversation_id));
create policy "messages: parties send" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and private.is_conversation_party(conversation_id));

-- Slows down floods: at most 20 messages a minute from one person.
-- Runs as the caller (not security definer) so it can tell app requests apart;
-- the sender can read every message they sent.
create or replace function private.guard_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_request() and (
    select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'You''re sending messages too quickly. Please wait a minute.' using errcode = '54000';
  end if;
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end;
$$;

create trigger messages_guard before insert on public.messages
  for each row execute function private.guard_message();

-- After a message: bump the conversation, count it as read by the sender and
-- tell the other side, once per unread conversation.
create or replace function private.after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations%rowtype;
  v_seller uuid;
  v_shop text;
  v_from_buyer boolean;
  v_to uuid;
  v_link text := '/messages/' || new.conversation_id;
begin
  select * into c from public.conversations where id = new.conversation_id;
  select a.user_id, s.name into v_seller, v_shop
  from public.storefronts s join public.seller_accounts a on a.id = s.seller_account_id
  where s.id = c.storefront_id;
  v_from_buyer := new.sender_id = c.buyer_id;
  v_to := case when v_from_buyer then v_seller else c.buyer_id end;

  update public.conversations set
    last_message_at = new.created_at,
    buyer_read_at = case when v_from_buyer then new.created_at else buyer_read_at end,
    seller_read_at = case when v_from_buyer then seller_read_at else new.created_at end
  where id = c.id;

  if v_to is not null and not exists (
    select 1 from public.notifications where user_id = v_to and link_path = v_link and read_at is null
  ) then
    insert into public.notifications (user_id, type, title, body, link_path)
    values (
      v_to, 'message.new',
      case when v_from_buyer then 'New message from a teacher' else left('New message from ' || v_shop, 160) end,
      left(new.body, 200), v_link
    );
  end if;
  return null;
end;
$$;

create trigger messages_after after insert on public.messages
  for each row execute function private.after_message();

-- Opens (or reuses) the viewer's conversation with a shop.
create or replace function public.start_conversation(p_storefront_id uuid, p_product_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to message a seller' using errcode = '42501';
  end if;
  if not exists (select 1 from public.storefronts where id = p_storefront_id and is_published) then
    raise exception 'This shop is not available' using errcode = 'P0002';
  end if;
  if private.owns_storefront(p_storefront_id) then
    raise exception 'This is your own shop' using errcode = '22023';
  end if;
  if p_product_id is not null and not exists (
    select 1 from public.products where id = p_product_id and storefront_id = p_storefront_id and status = 'published'
  ) then
    p_product_id := null;
  end if;

  insert into public.conversations (buyer_id, storefront_id, product_id)
  values (v_user, p_storefront_id, p_product_id)
  on conflict (buyer_id, storefront_id) do update set product_id = coalesce(excluded.product_id, public.conversations.product_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.start_conversation(uuid, uuid) from public, anon;
grant execute on function public.start_conversation(uuid, uuid) to authenticated;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set
    buyer_read_at = case when buyer_id = auth.uid() then now() else buyer_read_at end,
    seller_read_at = case when private.owns_storefront(storefront_id) then now() else seller_read_at end
  where id = p_conversation_id and private.is_conversation_party(id);
  update public.notifications set read_at = now()
  where user_id = auth.uid() and link_path = '/messages/' || p_conversation_id and read_at is null;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.report_conversation(p_conversation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.is_conversation_party(p_conversation_id) then
    raise exception 'Unknown conversation' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) < 10 then
    raise exception 'Tell us what happened (at least 10 characters)' using errcode = '22023';
  end if;
  update public.conversations
  set reported_at = now(), reported_by = auth.uid(), report_reason = left(v_reason, 1000)
  where id = p_conversation_id;
  perform private.audit('conversation.report', 'conversation', p_conversation_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.report_conversation(uuid, text) from public, anon;
grant execute on function public.report_conversation(uuid, text) to authenticated;

-- Staff close a report once handled; the conversation stays with its parties.
create or replace function public.clear_conversation_report(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only GuroMart staff can do this' using errcode = '42501';
  end if;
  update public.conversations set reported_at = null, reported_by = null, report_reason = null where id = p_conversation_id;
  perform private.audit('conversation.report_cleared', 'conversation', p_conversation_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.clear_conversation_report(uuid) from public, anon;
grant execute on function public.clear_conversation_report(uuid) to authenticated;

-- The viewer's conversations, as buyer and as seller, with names each side may see:
-- teachers see the shop's name, sellers see the teacher's first name only.
create or replace function public.my_conversations()
returns table (
  id uuid, role text, other_name text, product_title text, product_slug text,
  last_message_at timestamptz, last_body text, unread boolean, reported boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
    case when c.buyer_id = auth.uid() then 'buyer' else 'seller' end,
    case when c.buyer_id = auth.uid() then s.name
      else coalesce(nullif(split_part(btrim(pr.display_name), ' ', 1), ''), 'A teacher') end,
    p.title, case when p.status = 'published' then p.slug end,
    c.last_message_at,
    (select m.body from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
    c.last_message_at is not null and c.last_message_at > coalesce(
      case when c.buyer_id = auth.uid() then c.buyer_read_at else c.seller_read_at end, '-infinity'::timestamptz),
    c.reported_at is not null
  from public.conversations c
  join public.storefronts s on s.id = c.storefront_id
  left join public.profiles pr on pr.id = c.buyer_id
  left join public.products p on p.id = c.product_id
  where c.buyer_id = auth.uid() or private.owns_storefront(c.storefront_id)
  order by coalesce(c.last_message_at, c.created_at) desc
  limit 200;
$$;

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- One conversation's header for a party or for staff on a report.
create or replace function public.conversation_header(p_conversation_id uuid)
returns table (
  id uuid, role text, buyer_name text, shop_name text, shop_slug text, product_title text, product_slug text,
  reported boolean, report_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
    case when c.buyer_id = auth.uid() then 'buyer' when private.owns_storefront(c.storefront_id) then 'seller' else 'staff' end,
    coalesce(nullif(split_part(btrim(pr.display_name), ' ', 1), ''), 'A teacher'),
    s.name, s.slug, p.title, case when p.status = 'published' then p.slug end,
    c.reported_at is not null,
    case when private.is_admin() then c.report_reason end
  from public.conversations c
  join public.storefronts s on s.id = c.storefront_id
  left join public.profiles pr on pr.id = c.buyer_id
  left join public.products p on p.id = c.product_id
  where c.id = p_conversation_id and private.can_read_conversation(c.id);
$$;

revoke all on function public.conversation_header(uuid) from public, anon;
grant execute on function public.conversation_header(uuid) to authenticated;
