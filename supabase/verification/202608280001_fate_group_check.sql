do $$
declare
  expected_members constant jsonb := jsonb_build_array(
    jsonb_build_object('member_id', '8d204af2-586f-4bfd-9799-378e13f2165f', 'name', 'ナカチ', 'sort_order', 10),
    jsonb_build_object('member_id', '54283175-5698-4573-b0dc-168e64a1fa9b', 'name', 'シャ卿', 'sort_order', 20),
    jsonb_build_object('member_id', 'bb5a6aae-9717-4274-8a0e-93859e34ab3f', 'name', 'チンピラ', 'sort_order', 30)
  );
  expected_member jsonb;
  business_count bigint;
begin
  if not exists (
    select 1
    from public.evenup_groups
    where group_id = 'fate'
      and name = 'チンパン'
      and active
  ) then
    raise exception 'The active チンパン group row is missing';
  end if;

  for expected_member in select * from jsonb_array_elements(expected_members) loop
    if not exists (
      select 1
      from public.evenup_members
      where group_id = 'fate'
        and member_id = expected_member->>'member_id'
        and name = expected_member->>'name'
        and active
        and sort_order = (expected_member->>'sort_order')::integer
    ) then
      raise exception 'チンパン member is missing or inconsistent: %', expected_member;
    end if;
  end loop;

  select
    (select count(*) from public.evenup_payments where group_id = 'fate')
    + (select count(*) from public.evenup_transfer_batches where group_id = 'fate')
  into business_count;

  if business_count <> 0 then
    raise exception 'チンパン already contains business data: % rows', business_count;
  end if;

  raise notice 'チンパン group verification passed';
end;
$$;
