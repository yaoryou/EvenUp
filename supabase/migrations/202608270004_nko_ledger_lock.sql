begin;

create or replace function private.lock_evenup_ledger(target_group_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_group_id is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_group_id || ':EVENUP_LEDGER', 0)
  );
end;
$$;

alter function public.evenup_payments_create(text, uuid, text, bigint, text, text[])
  set schema private;
alter function private.evenup_payments_create(text, uuid, text, bigint, text, text[])
  rename to evenup_payments_create_unlocked;

alter function public.evenup_payments_update(text, uuid, uuid, timestamptz, text, bigint, text, text[])
  set schema private;
alter function private.evenup_payments_update(text, uuid, uuid, timestamptz, text, bigint, text, text[])
  rename to evenup_payments_update_unlocked;

alter function public.evenup_payments_cancel(text, uuid, uuid, timestamptz)
  set schema private;
alter function private.evenup_payments_cancel(text, uuid, uuid, timestamptz)
  rename to evenup_payments_cancel_unlocked;

create or replace function public.evenup_payments_create(
  p_group_id text,
  p_request_id uuid,
  p_description text,
  p_amount bigint,
  p_paid_by text,
  p_target_member_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return private.evenup_error('FORBIDDEN', 'ログインが必要です。');
  end if;

  perform private.lock_evenup_ledger(p_group_id);
  return private.evenup_payments_create_unlocked(
    p_group_id,
    p_request_id,
    p_description,
    p_amount,
    p_paid_by,
    p_target_member_ids
  );
end;
$$;

create or replace function public.evenup_payments_update(
  p_group_id text,
  p_request_id uuid,
  p_payment_id uuid,
  p_expected_updated_at timestamptz,
  p_description text,
  p_amount bigint,
  p_paid_by text,
  p_target_member_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return private.evenup_error('FORBIDDEN', 'ログインが必要です。');
  end if;

  perform private.lock_evenup_ledger(p_group_id);
  return private.evenup_payments_update_unlocked(
    p_group_id,
    p_request_id,
    p_payment_id,
    p_expected_updated_at,
    p_description,
    p_amount,
    p_paid_by,
    p_target_member_ids
  );
end;
$$;

create or replace function public.evenup_payments_cancel(
  p_group_id text,
  p_request_id uuid,
  p_payment_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return private.evenup_error('FORBIDDEN', 'ログインが必要です。');
  end if;

  perform private.lock_evenup_ledger(p_group_id);
  return private.evenup_payments_cancel_unlocked(
    p_group_id,
    p_request_id,
    p_payment_id,
    p_expected_updated_at
  );
end;
$$;

revoke all on function private.lock_evenup_ledger(text)
  from public, anon, authenticated, service_role;
revoke all on function private.evenup_payments_create_unlocked(text, uuid, text, bigint, text, text[])
  from public, anon, authenticated, service_role;
revoke all on function private.evenup_payments_update_unlocked(text, uuid, uuid, timestamptz, text, bigint, text, text[])
  from public, anon, authenticated, service_role;
revoke all on function private.evenup_payments_cancel_unlocked(text, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

revoke all on function public.evenup_payments_create(text, uuid, text, bigint, text, text[])
  from public, anon, authenticated, service_role;
revoke all on function public.evenup_payments_update(text, uuid, uuid, timestamptz, text, bigint, text, text[])
  from public, anon, authenticated, service_role;
revoke all on function public.evenup_payments_cancel(text, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.evenup_payments_create(text, uuid, text, bigint, text, text[])
  to authenticated;
grant execute on function public.evenup_payments_update(text, uuid, uuid, timestamptz, text, bigint, text, text[])
  to authenticated;
grant execute on function public.evenup_payments_cancel(text, uuid, uuid, timestamptz)
  to authenticated;

commit;
