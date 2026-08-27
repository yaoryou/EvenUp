begin;

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.evenup_groups (
  group_id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evenup_groups_group_id_format
    check (group_id ~ '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$'),
  constraint evenup_groups_name_length
    check (char_length(btrim(name)) between 1 and 50)
);

create table public.evenup_members (
  group_id text not null,
  member_id text not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, member_id),
  constraint evenup_members_group_fk
    foreign key (group_id)
    references public.evenup_groups (group_id)
    on update restrict
    on delete restrict,
  constraint evenup_members_member_id_length
    check (char_length(member_id) between 1 and 50),
  constraint evenup_members_name_length
    check (char_length(btrim(name)) between 1 and 50),
  constraint evenup_members_sort_order_nonnegative
    check (sort_order >= 0)
);

create table public.evenup_group_memberships (
  group_id text not null,
  user_id uuid not null,
  member_id text not null,
  role text not null default 'MEMBER',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id),
  unique (group_id, member_id),
  constraint evenup_group_memberships_user_fk
    foreign key (user_id)
    references auth.users (id)
    on update restrict
    on delete restrict,
  constraint evenup_group_memberships_member_fk
    foreign key (group_id, member_id)
    references public.evenup_members (group_id, member_id)
    on update restrict
    on delete restrict,
  constraint evenup_group_memberships_role
    check (role in ('MEMBER', 'ADMIN'))
);

create table public.evenup_payments (
  payment_id uuid primary key default gen_random_uuid(),
  group_id text not null,
  request_id uuid not null,
  paid_at timestamptz not null default now(),
  description text not null,
  paid_by text not null,
  amount bigint not null,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, payment_id),
  unique (group_id, created_by_user_id, request_id),
  constraint evenup_payments_payer_fk
    foreign key (group_id, paid_by)
    references public.evenup_members (group_id, member_id)
    on update restrict
    on delete restrict,
  constraint evenup_payments_creator_fk
    foreign key (group_id, created_by_user_id)
    references public.evenup_group_memberships (group_id, user_id)
    on update restrict
    on delete restrict,
  constraint evenup_payments_updater_fk
    foreign key (group_id, updated_by_user_id)
    references public.evenup_group_memberships (group_id, user_id)
    on update restrict
    on delete restrict,
  constraint evenup_payments_canceller_fk
    foreign key (group_id, cancelled_by_user_id)
    references public.evenup_group_memberships (group_id, user_id)
    on update restrict
    on delete restrict,
  constraint evenup_payments_description_length
    check (char_length(btrim(description)) between 1 and 100),
  constraint evenup_payments_amount_range
    check (amount between 1 and 99999999),
  constraint evenup_payments_cancellation_consistent
    check (
      (cancelled_at is null and cancelled_by_user_id is null)
      or (cancelled_at is not null and cancelled_by_user_id is not null)
    )
);

create table public.evenup_payment_shares (
  group_id text not null,
  payment_id uuid not null,
  member_id text not null,
  share_amount bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, payment_id, member_id),
  constraint evenup_payment_shares_payment_fk
    foreign key (group_id, payment_id)
    references public.evenup_payments (group_id, payment_id)
    on update restrict
    on delete restrict,
  constraint evenup_payment_shares_member_fk
    foreign key (group_id, member_id)
    references public.evenup_members (group_id, member_id)
    on update restrict
    on delete restrict,
  constraint evenup_payment_shares_amount_nonnegative
    check (share_amount >= 0)
);

create table public.evenup_transfer_batches (
  transfer_batch_id uuid primary key default gen_random_uuid(),
  group_id text not null,
  request_id uuid not null,
  mode text not null,
  transferred_at timestamptz not null default now(),
  status text not null default 'ACTIVE',
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, transfer_batch_id),
  unique (group_id, created_by_user_id, request_id),
  constraint evenup_transfer_batches_creator_fk
    foreign key (group_id, created_by_user_id)
    references public.evenup_group_memberships (group_id, user_id)
    on update restrict
    on delete restrict,
  constraint evenup_transfer_batches_updater_fk
    foreign key (group_id, updated_by_user_id)
    references public.evenup_group_memberships (group_id, user_id)
    on update restrict
    on delete restrict,
  constraint evenup_transfer_batches_canceller_fk
    foreign key (group_id, cancelled_by_user_id)
    references public.evenup_group_memberships (group_id, user_id)
    on update restrict
    on delete restrict,
  constraint evenup_transfer_batches_mode
    check (mode in ('DIRECT', 'OPTIMIZED')),
  constraint evenup_transfer_batches_status
    check (status in ('ACTIVE', 'CANCELLED')),
  constraint evenup_transfer_batches_cancellation_consistent
    check (
      (status = 'ACTIVE' and cancelled_at is null and cancelled_by_user_id is null)
      or (status = 'CANCELLED' and cancelled_at is not null and cancelled_by_user_id is not null)
    )
);

create table public.evenup_transfers (
  transfer_id uuid primary key default gen_random_uuid(),
  group_id text not null,
  transfer_batch_id uuid not null,
  from_member_id text not null,
  to_member_id text not null,
  amount bigint not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (group_id, transfer_id),
  unique (group_id, transfer_batch_id, sort_order),
  constraint evenup_transfers_batch_fk
    foreign key (group_id, transfer_batch_id)
    references public.evenup_transfer_batches (group_id, transfer_batch_id)
    on update restrict
    on delete restrict,
  constraint evenup_transfers_from_member_fk
    foreign key (group_id, from_member_id)
    references public.evenup_members (group_id, member_id)
    on update restrict
    on delete restrict,
  constraint evenup_transfers_to_member_fk
    foreign key (group_id, to_member_id)
    references public.evenup_members (group_id, member_id)
    on update restrict
    on delete restrict,
  constraint evenup_transfers_distinct_members
    check (from_member_id <> to_member_id),
  constraint evenup_transfers_amount_nonnegative
    check (amount >= 0),
  constraint evenup_transfers_sort_order_positive
    check (sort_order > 0)
);

create table public.evenup_transfer_allocations (
  allocation_id uuid primary key default gen_random_uuid(),
  group_id text not null,
  transfer_batch_id uuid not null,
  payment_id uuid not null,
  member_id text not null,
  allocated_amount bigint not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (group_id, allocation_id),
  unique (group_id, transfer_batch_id, payment_id, member_id),
  unique (group_id, transfer_batch_id, sort_order),
  constraint evenup_transfer_allocations_batch_fk
    foreign key (group_id, transfer_batch_id)
    references public.evenup_transfer_batches (group_id, transfer_batch_id)
    on update restrict
    on delete restrict,
  constraint evenup_transfer_allocations_share_fk
    foreign key (group_id, payment_id, member_id)
    references public.evenup_payment_shares (group_id, payment_id, member_id)
    on update restrict
    on delete restrict,
  constraint evenup_transfer_allocations_amount_positive
    check (allocated_amount > 0),
  constraint evenup_transfer_allocations_sort_order_positive
    check (sort_order > 0)
);

create table public.evenup_audit_events (
  event_id bigint generated always as identity primary key,
  group_id text not null,
  actor_user_id uuid not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  request_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  constraint evenup_audit_events_actor_fk
    foreign key (group_id, actor_user_id)
    references public.evenup_group_memberships (group_id, user_id)
    on update restrict
    on delete restrict,
  constraint evenup_audit_events_action_length
    check (char_length(action) between 1 and 80),
  constraint evenup_audit_events_entity_type_length
    check (char_length(entity_type) between 1 and 50),
  constraint evenup_audit_events_entity_id_length
    check (char_length(entity_id) between 1 and 100)
);

create index evenup_members_group_active_sort_idx
  on public.evenup_members (group_id, active, sort_order, member_id);

create index evenup_group_memberships_user_active_idx
  on public.evenup_group_memberships (user_id, active, group_id);

create index evenup_payments_group_paid_at_idx
  on public.evenup_payments (group_id, paid_at desc, payment_id desc);

create index evenup_payments_group_active_idx
  on public.evenup_payments (group_id, payment_id)
  where cancelled_at is null;

create index evenup_payment_shares_payment_idx
  on public.evenup_payment_shares (group_id, payment_id);

create index evenup_transfer_batches_group_transferred_idx
  on public.evenup_transfer_batches (group_id, transferred_at desc, transfer_batch_id desc);

create index evenup_transfer_batches_group_active_idx
  on public.evenup_transfer_batches (group_id, transferred_at desc, transfer_batch_id desc)
  where status = 'ACTIVE';

create index evenup_transfers_batch_idx
  on public.evenup_transfers (group_id, transfer_batch_id, sort_order);

create index evenup_transfer_allocations_payment_idx
  on public.evenup_transfer_allocations (group_id, payment_id, member_id);

create index evenup_transfer_allocations_batch_idx
  on public.evenup_transfer_allocations (group_id, transfer_batch_id, sort_order);

create index evenup_audit_events_group_created_idx
  on public.evenup_audit_events (group_id, created_at desc, event_id desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger evenup_groups_set_updated_at
before update on public.evenup_groups
for each row execute function private.set_updated_at();

create trigger evenup_members_set_updated_at
before update on public.evenup_members
for each row execute function private.set_updated_at();

create trigger evenup_group_memberships_set_updated_at
before update on public.evenup_group_memberships
for each row execute function private.set_updated_at();

create trigger evenup_payments_set_updated_at
before update on public.evenup_payments
for each row execute function private.set_updated_at();

create trigger evenup_payment_shares_set_updated_at
before update on public.evenup_payment_shares
for each row execute function private.set_updated_at();

create trigger evenup_transfer_batches_set_updated_at
before update on public.evenup_transfer_batches
for each row execute function private.set_updated_at();

create or replace function private.is_active_group_member(target_group_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.evenup_group_memberships membership
      join public.evenup_groups target_group
        on target_group.group_id = membership.group_id
      where membership.group_id = target_group_id
        and membership.user_id = (select auth.uid())
        and membership.active
        and target_group.active
    );
$$;

create or replace function private.is_group_admin(target_group_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_group_member(target_group_id)
    and exists (
      select 1
      from public.evenup_group_memberships membership
      where membership.group_id = target_group_id
        and membership.user_id = (select auth.uid())
        and membership.active
        and membership.role = 'ADMIN'
    );
$$;

create or replace function private.can_manage_record(
  target_group_id text,
  owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_group_member(target_group_id)
    and (
      owner_user_id = (select auth.uid())
      or private.is_group_admin(target_group_id)
    );
$$;

create or replace function private.current_member_id(target_group_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.member_id
  from public.evenup_group_memberships membership
  join public.evenup_groups target_group
    on target_group.group_id = membership.group_id
  where membership.group_id = target_group_id
    and membership.user_id = (select auth.uid())
    and membership.active
    and target_group.active;
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.is_active_group_member(text) from public;
revoke all on function private.is_group_admin(text) from public;
revoke all on function private.can_manage_record(text, uuid) from public;
revoke all on function private.current_member_id(text) from public;

grant execute on function private.is_active_group_member(text) to authenticated;
grant execute on function private.is_group_admin(text) to authenticated;
grant execute on function private.can_manage_record(text, uuid) to authenticated;
grant execute on function private.current_member_id(text) to authenticated;

alter table public.evenup_groups enable row level security;
alter table public.evenup_members enable row level security;
alter table public.evenup_group_memberships enable row level security;
alter table public.evenup_payments enable row level security;
alter table public.evenup_payment_shares enable row level security;
alter table public.evenup_transfer_batches enable row level security;
alter table public.evenup_transfers enable row level security;
alter table public.evenup_transfer_allocations enable row level security;
alter table public.evenup_audit_events enable row level security;

revoke all on table public.evenup_groups from public, anon, authenticated, service_role;
revoke all on table public.evenup_members from public, anon, authenticated, service_role;
revoke all on table public.evenup_group_memberships from public, anon, authenticated, service_role;
revoke all on table public.evenup_payments from public, anon, authenticated, service_role;
revoke all on table public.evenup_payment_shares from public, anon, authenticated, service_role;
revoke all on table public.evenup_transfer_batches from public, anon, authenticated, service_role;
revoke all on table public.evenup_transfers from public, anon, authenticated, service_role;
revoke all on table public.evenup_transfer_allocations from public, anon, authenticated, service_role;
revoke all on table public.evenup_audit_events from public, anon, authenticated, service_role;
revoke all on sequence public.evenup_audit_events_event_id_seq from public, anon, authenticated, service_role;

grant select on table public.evenup_groups to authenticated;
grant select on table public.evenup_members to authenticated;
grant select on table public.evenup_group_memberships to authenticated;
grant select on table public.evenup_payments to authenticated;
grant select on table public.evenup_payment_shares to authenticated;
grant select on table public.evenup_transfer_batches to authenticated;
grant select on table public.evenup_transfers to authenticated;
grant select on table public.evenup_transfer_allocations to authenticated;
grant select on table public.evenup_audit_events to authenticated;

create policy evenup_groups_select_active_members
on public.evenup_groups
for select
to authenticated
using ((select private.is_active_group_member(group_id)));

create policy evenup_members_select_active_members
on public.evenup_members
for select
to authenticated
using ((select private.is_active_group_member(group_id)));

create policy evenup_memberships_select_self_or_admin
on public.evenup_group_memberships
for select
to authenticated
using (
  (select private.is_active_group_member(group_id))
  and (
    user_id = (select auth.uid())
    or (select private.is_group_admin(group_id))
  )
);

create policy evenup_payments_select_active_members
on public.evenup_payments
for select
to authenticated
using ((select private.is_active_group_member(group_id)));

create policy evenup_payment_shares_select_active_members
on public.evenup_payment_shares
for select
to authenticated
using ((select private.is_active_group_member(group_id)));

create policy evenup_transfer_batches_select_active_members
on public.evenup_transfer_batches
for select
to authenticated
using ((select private.is_active_group_member(group_id)));

create policy evenup_transfers_select_active_members
on public.evenup_transfers
for select
to authenticated
using ((select private.is_active_group_member(group_id)));

create policy evenup_transfer_allocations_select_active_members
on public.evenup_transfer_allocations
for select
to authenticated
using ((select private.is_active_group_member(group_id)));

create policy evenup_audit_events_select_actor_or_admin
on public.evenup_audit_events
for select
to authenticated
using (
  (select private.is_active_group_member(group_id))
  and (
    actor_user_id = (select auth.uid())
    or (select private.is_group_admin(group_id))
  )
);

insert into public.evenup_groups (group_id, name)
values ('nko', 'NKO')
on conflict (group_id) do nothing;

commit;
