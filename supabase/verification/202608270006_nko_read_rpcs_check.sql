begin;

do $$
declare
  v_signature text;
  v_anon_grant boolean;
  v_authenticated_grant boolean;
begin
  foreach v_signature in array array[
    'public.evenup_bootstrap(text)',
    'public.evenup_settlement_preview(text)',
    'public.evenup_history_list(text,text,text,integer)'
  ] loop
    if pg_catalog.to_regprocedure(v_signature) is null then
      raise exception 'Missing read RPC: %', v_signature;
    end if;
    select pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE') into v_anon_grant;
    select pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE') into v_authenticated_grant;
    if v_anon_grant then raise exception 'anon must not execute %', v_signature; end if;
    if not v_authenticated_grant then raise exception 'authenticated must execute %', v_signature; end if;
  end loop;

  if pg_catalog.has_function_privilege('authenticated', 'private.evenup_preview_json(text)', 'EXECUTE') then
    raise exception 'authenticated must not execute private preview helper';
  end if;
  if pg_catalog.has_function_privilege('authenticated', 'private.evenup_direct_routes_json(text)', 'EXECUTE') then
    raise exception 'authenticated must not execute private direct route helper';
  end if;
end;
$$;

rollback;
