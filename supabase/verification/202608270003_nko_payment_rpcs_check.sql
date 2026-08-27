do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.evenup_payments_create(text,uuid,text,bigint,text,text[])',
    'public.evenup_payments_update(text,uuid,uuid,timestamp with time zone,text,bigint,text,text[])',
    'public.evenup_payments_cancel(text,uuid,uuid,timestamp with time zone)'
  ] loop
    if pg_catalog.to_regprocedure(function_signature) is null then
      raise exception 'Missing payment RPC: %', function_signature;
    end if;

    if not pg_catalog.has_function_privilege('authenticated', function_signature, 'EXECUTE') then
      raise exception 'authenticated cannot execute payment RPC: %', function_signature;
    end if;

    if pg_catalog.has_function_privilege('anon', function_signature, 'EXECUTE') then
      raise exception 'anon can unexpectedly execute payment RPC: %', function_signature;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'evenup_audit_events_request_idempotency_idx'
  ) then
    raise exception 'Payment RPC idempotency index is missing';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conname in (
      'evenup_transfer_allocations_payment_fk',
      'evenup_transfer_allocations_member_fk'
    )
  ) <> 2 then
    raise exception 'Replacement transfer allocation constraints are incomplete';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conname = 'evenup_transfer_allocations_share_fk'
  ) then
    raise exception 'Obsolete transfer allocation share constraint still exists';
  end if;

  raise notice 'NKO payment RPC verification passed';
end;
$$;
