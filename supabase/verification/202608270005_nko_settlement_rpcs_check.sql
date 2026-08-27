do $$
declare
  function_signature text;
begin
  if pg_catalog.to_regprocedure('private.lock_evenup_ledger(text)') is null then
    raise exception 'Ledger lock helper is missing';
  end if;

  foreach function_signature in array array[
    'private.evenup_payments_create_unlocked(text,uuid,text,bigint,text,text[])',
    'private.evenup_payments_update_unlocked(text,uuid,uuid,timestamp with time zone,text,bigint,text,text[])',
    'private.evenup_payments_cancel_unlocked(text,uuid,uuid,timestamp with time zone)'
  ] loop
    if pg_catalog.to_regprocedure(function_signature) is null then
      raise exception 'Private payment implementation is missing: %', function_signature;
    end if;

    if pg_catalog.has_function_privilege('authenticated', function_signature, 'EXECUTE') then
      raise exception 'authenticated can execute private payment implementation: %', function_signature;
    end if;
  end loop;

  foreach function_signature in array array[
    'public.evenup_transfers_create_direct(text,uuid,text,text,text,bigint)',
    'public.evenup_transfers_create_optimized(text,uuid,text)',
    'public.evenup_transfers_cancel_latest(text,uuid,uuid)'
  ] loop
    if pg_catalog.to_regprocedure(function_signature) is null then
      raise exception 'Settlement RPC is missing: %', function_signature;
    end if;

    if not pg_catalog.has_function_privilege('authenticated', function_signature, 'EXECUTE') then
      raise exception 'authenticated cannot execute settlement RPC: %', function_signature;
    end if;

    if pg_catalog.has_function_privilege('anon', function_signature, 'EXECUTE') then
      raise exception 'anon can unexpectedly execute settlement RPC: %', function_signature;
    end if;
  end loop;

  raise notice 'NKO settlement RPC verification passed';
end;
$$;
