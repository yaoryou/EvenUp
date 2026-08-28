-- Replace the member ID placeholder below with the signed-in person's チンパン member ID.
-- This reuses the single active NKO administrator's Auth user without storing an email address.

begin;

do $$
declare
  target_member_id constant text := '<MEMBER_ID>';
  source_admin_count integer;
  source_user_id uuid;
begin
  select count(*), min(user_id::text)::uuid
  into source_admin_count, source_user_id
  from public.evenup_group_memberships
  where group_id = 'nko'
    and role = 'ADMIN'
    and active;

  if source_admin_count <> 1 then
    raise exception 'Expected exactly one active NKO administrator, found %', source_admin_count;
  end if;

  insert into public.evenup_group_memberships (
    group_id,
    user_id,
    member_id,
    role,
    active
  )
  values (
    'fate',
    source_user_id,
    target_member_id,
    'ADMIN',
    true
  )
  on conflict (group_id, user_id) do update
  set
    member_id = excluded.member_id,
    role = excluded.role,
    active = excluded.active;
end;
$$;

commit;
