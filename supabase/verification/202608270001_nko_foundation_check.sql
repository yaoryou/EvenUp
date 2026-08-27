do $$
declare
  expected_tables constant text[] := array[
    'evenup_groups',
    'evenup_members',
    'evenup_group_memberships',
    'evenup_payments',
    'evenup_payment_shares',
    'evenup_transfer_batches',
    'evenup_transfers',
    'evenup_transfer_allocations',
    'evenup_audit_events'
  ];
  table_name text;
  rls_enabled boolean;
  unexpected_grants integer;
begin
  foreach table_name in array expected_tables loop
    select c.relrowsecurity
    into rls_enabled
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = table_name
      and c.relkind = 'r';

    if rls_enabled is distinct from true then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;
  end loop;

  select count(*)
  into unexpected_grants
  from information_schema.role_table_grants grants
  where grants.table_schema = 'public'
    and grants.table_name = any(expected_tables)
    and grants.grantee = 'anon';

  if unexpected_grants <> 0 then
    raise exception 'anon has unexpected EvenUp table grants: %', unexpected_grants;
  end if;

  select count(*)
  into unexpected_grants
  from information_schema.role_table_grants grants
  where grants.table_schema = 'public'
    and grants.table_name = any(expected_tables)
    and grants.grantee = 'authenticated'
    and grants.privilege_type <> 'SELECT';

  if unexpected_grants <> 0 then
    raise exception 'authenticated has unexpected EvenUp write grants: %', unexpected_grants;
  end if;

  if not exists (
    select 1
    from public.evenup_groups
    where group_id = 'nko'
      and active
  ) then
    raise exception 'The active NKO group row is missing';
  end if;

  raise notice 'NKO foundation verification passed';
end;
$$;
