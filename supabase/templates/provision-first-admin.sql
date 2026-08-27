-- Replace every value in angle brackets before running this file.
-- Obtain <AUTH_USER_UUID> from Authentication > Users in Supabase Dashboard.
-- Use the existing NKO member ID and display name from the Google Sheet.

begin;

insert into public.evenup_members (
  group_id,
  member_id,
  name,
  active,
  sort_order
)
values (
  'nko',
  '<MEMBER_ID>',
  '<DISPLAY_NAME>',
  true,
  <SORT_ORDER>
);

insert into public.evenup_group_memberships (
  group_id,
  user_id,
  member_id,
  role,
  active
)
values (
  'nko',
  '<AUTH_USER_UUID>'::uuid,
  '<MEMBER_ID>',
  'ADMIN',
  true
);

commit;
