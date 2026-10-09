-- Seller identity verification and payout details.
-- Sellers upload an ID to the private verification-documents bucket and staff
-- review it. Verification gates payouts, not listing (see review_listing).

-- One open request at a time, and the document must sit in the seller's folder.
create unique index seller_verifications_one_pending
  on public.seller_verifications (seller_account_id) where status = 'pending';

create or replace function private.guard_verification_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_request() and new.document_path not like (new.seller_account_id::text || '/%') then
    raise exception 'Document path does not belong to this seller' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger seller_verifications_guard before insert on public.seller_verifications
  for each row execute function private.guard_verification_insert();

-- Submitting a request marks the account as pending review.
create or replace function private.verification_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.seller_accounts set verification_status = 'pending'
  where id = new.seller_account_id and verification_status <> 'verified';
  perform private.audit('seller.verification_submitted', 'seller_account', new.seller_account_id::text,
    jsonb_build_object('verification_id', new.id, 'kind', new.kind));
  return new;
end;
$$;

create trigger seller_verifications_submitted after insert on public.seller_verifications
  for each row execute function private.verification_submitted();

-- Staff decide through this function only; direct updates are closed.
drop policy "seller_verifications: admin reviews" on public.seller_verifications;

create or replace function public.review_verification(p_verification_id uuid, p_approve boolean, p_notes text default null)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.seller_verifications%rowtype;
  v_owner uuid;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_result public.verification_status := case when p_approve then 'verified' else 'rejected' end;
begin
  if not private.is_admin() then
    raise exception 'Only GuroMart staff can review verifications' using errcode = '42501';
  end if;
  select * into v_row from public.seller_verifications where id = p_verification_id for update;
  if not found then
    raise exception 'Unknown verification request' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This request has already been reviewed' using errcode = '22023';
  end if;
  if not p_approve and (v_notes is null or char_length(v_notes) < 10) then
    raise exception 'Tell the seller what to fix (at least 10 characters)' using errcode = '22023';
  end if;

  update public.seller_verifications
  set status = v_result, reviewer_id = auth.uid(), reviewer_notes = left(v_notes, 2000), reviewed_at = now()
  where id = p_verification_id;
  update public.seller_accounts set verification_status = v_result where id = v_row.seller_account_id
  returning user_id into v_owner;

  perform private.audit('seller.verification_reviewed', 'seller_account', v_row.seller_account_id::text,
    jsonb_build_object('verification_id', p_verification_id, 'result', v_result));

  insert into public.notifications (user_id, type, title, body, link_path)
  values (v_owner,
    case when p_approve then 'verification.approved' else 'verification.rejected' end,
    case when p_approve then 'Your identity is verified' else 'Your ID needs another look' end,
    case when p_approve then 'You can now receive payouts once your earnings reach the minimum.' else left(v_notes, 1000) end,
    '/seller/verify');
  return v_result;
end;
$$;

revoke all on function public.review_verification(uuid, boolean, text) from public, anon;
grant execute on function public.review_verification(uuid, boolean, text) to authenticated;

-- Changing where money goes is a common fraud step, so every change is audited.
create or replace function private.audit_payout_method()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.seller_payout_methods%rowtype := coalesce(new, old);
begin
  perform private.audit('seller.payout_method_' || lower(tg_op), 'seller_account', v_row.seller_account_id::text,
    jsonb_build_object('method', v_row.method, 'account_last4', right(regexp_replace(v_row.account_number, '[^0-9]', '', 'g'), 4)));
  return v_row;
end;
$$;

create trigger seller_payout_methods_audit after insert or update or delete on public.seller_payout_methods
  for each row execute function private.audit_payout_method();

-- GCash and Maya accounts are 11-digit mobile numbers starting with 09.
alter table public.seller_payout_methods add constraint seller_payout_methods_wallet_number
  check (method = 'bank' or regexp_replace(account_number, '[^0-9]', '', 'g') ~ '^09[0-9]{9}$');
