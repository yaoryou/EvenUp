begin;

insert into public.evenup_groups (
  group_id,
  name,
  active
)
values (
  'fate',
  'チンパン',
  true
)
on conflict (group_id) do update
set
  name = excluded.name,
  active = excluded.active;

insert into public.evenup_members (
  group_id,
  member_id,
  name,
  active,
  sort_order
)
values
  ('fate', '8d204af2-586f-4bfd-9799-378e13f2165f', 'ナカチ', true, 10),
  ('fate', '54283175-5698-4573-b0dc-168e64a1fa9b', 'シャ卿', true, 20),
  ('fate', 'bb5a6aae-9717-4274-8a0e-93859e34ab3f', 'チンピラ', true, 30)
on conflict (group_id, member_id) do update
set
  name = excluded.name,
  active = excluded.active,
  sort_order = excluded.sort_order;

commit;
