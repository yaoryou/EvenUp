begin;

insert into public.evenup_members (
  group_id,
  member_id,
  name,
  active,
  sort_order
)
values
  ('nko', 'c124f6f2-7ff8-4386-88df-f5dbd3007432', '兄', true, 10),
  ('nko', 'cb2972b8-6ca7-450a-910a-4c6261abc528', '妹', true, 20),
  ('nko', 'b0b41c09-be15-419f-a862-e43176638198', '母', true, 30),
  ('nko', '4e4d754c-6a89-441e-af5c-9b56a3966f46', '父', true, 40)
on conflict (group_id, member_id) do update
set
  name = excluded.name,
  active = excluded.active,
  sort_order = excluded.sort_order;

commit;
