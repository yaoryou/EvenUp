begin;

create or replace function private.evenup_open_debts(target_group_id text)
returns table (
  payment_id uuid,
  debtor_member_id text,
  creditor_member_id text,
  original_amount bigint,
  allocated_amount bigint,
  remaining_amount bigint,
  paid_at timestamptz,
  description text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    payment.payment_id,
    share.member_id as debtor_member_id,
    payment.paid_by as creditor_member_id,
    share.share_amount as original_amount,
    coalesce(
      pg_catalog.sum(allocation.allocated_amount) filter (
        where transfer_batch.status = 'ACTIVE'
      ),
      0::numeric
    )::bigint as allocated_amount,
    greatest(
      share.share_amount - coalesce(
        pg_catalog.sum(allocation.allocated_amount) filter (
          where transfer_batch.status = 'ACTIVE'
        ),
        0::numeric
      )::bigint,
      0::bigint
    ) as remaining_amount,
    payment.paid_at,
    payment.description
  from public.evenup_payments payment
  join public.evenup_payment_shares share
    on share.group_id = payment.group_id
    and share.payment_id = payment.payment_id
  left join public.evenup_transfer_allocations allocation
    on allocation.group_id = share.group_id
    and allocation.payment_id = share.payment_id
    and allocation.member_id = share.member_id
  left join public.evenup_transfer_batches transfer_batch
    on transfer_batch.group_id = allocation.group_id
    and transfer_batch.transfer_batch_id = allocation.transfer_batch_id
  where payment.group_id = target_group_id
    and payment.cancelled_at is null
    and share.member_id <> payment.paid_by
  group by
    payment.payment_id,
    share.member_id,
    payment.paid_by,
    share.share_amount,
    payment.paid_at,
    payment.description;
$$;

create or replace function private.evenup_snapshot_token(target_group_id text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_material text;
begin
  select coalesce(
    pg_catalog.string_agg(
      debt.payment_id::text || ':'
        || debt.debtor_member_id || ':'
        || debt.creditor_member_id || ':'
        || debt.original_amount::text || ':'
        || debt.allocated_amount::text || ':'
        || debt.remaining_amount::text,
      '|' order by debt.payment_id::text, debt.debtor_member_id
    ),
    ''
  )
  into v_material
  from private.evenup_open_debts(target_group_id) debt
  where debt.remaining_amount > 0;

  return pg_catalog.rtrim(
    pg_catalog.translate(
      pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(v_material, 'UTF8')),
        'base64'
      ),
      '+/',
      '-_'
    ),
    '='
  );
end;
$$;

create or replace function private.evenup_direct_route(
  target_group_id text,
  target_from_member_id text,
  target_to_member_id text
)
returns table (
  route_key text,
  remaining_amount bigint,
  offset_amount bigint,
  is_offset_only boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_forward_amount bigint;
  v_reverse_amount bigint;
  v_material text;
begin
  select
    coalesce(pg_catalog.sum(debt.remaining_amount), 0::numeric)::bigint
  into v_forward_amount
  from private.evenup_open_debts(target_group_id) debt
  where debt.remaining_amount > 0
    and debt.debtor_member_id = target_from_member_id
    and debt.creditor_member_id = target_to_member_id;

  select
    coalesce(pg_catalog.sum(debt.remaining_amount), 0::numeric)::bigint
  into v_reverse_amount
  from private.evenup_open_debts(target_group_id) debt
  where debt.remaining_amount > 0
    and debt.debtor_member_id = target_to_member_id
    and debt.creditor_member_id = target_from_member_id;

  if v_forward_amount = 0 and v_reverse_amount = 0 then
    return;
  end if;

  if v_forward_amount < v_reverse_amount
    or (v_forward_amount = v_reverse_amount and target_from_member_id > target_to_member_id) then
    return;
  end if;

  remaining_amount := v_forward_amount - v_reverse_amount;
  offset_amount := v_reverse_amount;
  is_offset_only := v_forward_amount = v_reverse_amount;

  select coalesce(
    pg_catalog.string_agg(
      route_debt.side || ':'
        || route_debt.debtor_member_id || ':'
        || route_debt.creditor_member_id || ':'
        || route_debt.payment_id::text || ':'
        || route_debt.remaining_amount::text,
      ',' order by
        route_debt.side_order,
        route_debt.paid_at,
        route_debt.payment_id::text,
        route_debt.debtor_member_id,
        route_debt.creditor_member_id
    ),
    ''
  )
  into v_material
  from (
    select
      1 as side_order,
      'PRIMARY'::text as side,
      debt.*
    from private.evenup_open_debts(target_group_id) debt
    where debt.remaining_amount > 0
      and debt.debtor_member_id = target_from_member_id
      and debt.creditor_member_id = target_to_member_id

    union all

    select
      2 as side_order,
      'OFFSET'::text as side,
      debt.*
    from private.evenup_open_debts(target_group_id) debt
    where debt.remaining_amount > 0
      and debt.debtor_member_id = target_to_member_id
      and debt.creditor_member_id = target_from_member_id
  ) route_debt;

  route_key := pg_catalog.rtrim(
    pg_catalog.translate(
      pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            target_from_member_id || '|'
              || target_to_member_id || '|'
              || remaining_amount::text || '|'
              || offset_amount::text || '|'
              || v_material,
            'UTF8'
          )
        ),
        'base64'
      ),
      '+/',
      '-_'
    ),
    '='
  );

  return next;
end;
$$;

create or replace function private.evenup_optimized_routes(target_group_id text)
returns table (
  from_member_id text,
  to_member_id text,
  amount bigint,
  sort_order integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_creditor_ids text[];
  v_creditor_amounts bigint[];
  v_debtor_ids text[];
  v_debtor_amounts bigint[];
  v_creditor_index integer := 1;
  v_debtor_index integer := 1;
begin
  with balance_changes as (
    select
      debt.creditor_member_id as member_id,
      debt.remaining_amount as amount
    from private.evenup_open_debts(target_group_id) debt
    where debt.remaining_amount > 0

    union all

    select
      debt.debtor_member_id as member_id,
      -debt.remaining_amount as amount
    from private.evenup_open_debts(target_group_id) debt
    where debt.remaining_amount > 0
  ),
  balances as (
    select
      balance_changes.member_id,
      pg_catalog.sum(balance_changes.amount)::bigint as balance
    from balance_changes
    group by balance_changes.member_id
  )
  select
    pg_catalog.array_agg(balances.member_id order by balances.balance desc, balances.member_id)
      filter (where balances.balance > 0),
    pg_catalog.array_agg(balances.balance order by balances.balance desc, balances.member_id)
      filter (where balances.balance > 0),
    pg_catalog.array_agg(balances.member_id order by -balances.balance desc, balances.member_id)
      filter (where balances.balance < 0),
    pg_catalog.array_agg(-balances.balance order by -balances.balance desc, balances.member_id)
      filter (where balances.balance < 0)
  into
    v_creditor_ids,
    v_creditor_amounts,
    v_debtor_ids,
    v_debtor_amounts
  from balances;

  while v_creditor_index <= coalesce(pg_catalog.cardinality(v_creditor_ids), 0)
    and v_debtor_index <= coalesce(pg_catalog.cardinality(v_debtor_ids), 0) loop
    from_member_id := v_debtor_ids[v_debtor_index];
    to_member_id := v_creditor_ids[v_creditor_index];
    amount := least(
      v_debtor_amounts[v_debtor_index],
      v_creditor_amounts[v_creditor_index]
    );
    sort_order := coalesce(sort_order, 0) + 1;
    return next;

    v_debtor_amounts[v_debtor_index] :=
      v_debtor_amounts[v_debtor_index] - amount;
    v_creditor_amounts[v_creditor_index] :=
      v_creditor_amounts[v_creditor_index] - amount;

    if v_debtor_amounts[v_debtor_index] = 0 then
      v_debtor_index := v_debtor_index + 1;
    end if;
    if v_creditor_amounts[v_creditor_index] = 0 then
      v_creditor_index := v_creditor_index + 1;
    end if;
  end loop;
end;
$$;

create or replace function private.transfer_batch_to_json(
  target_group_id text,
  target_transfer_batch_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'transfer_batch_id', transfer_batch.transfer_batch_id,
    'mode', transfer_batch.mode,
    'transferred_at', transfer_batch.transferred_at,
    'status', transfer_batch.status,
    'cancelled_at', transfer_batch.cancelled_at,
    'created_at', transfer_batch.created_at,
    'updated_at', transfer_batch.updated_at,
    'transfers', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'transfer_id', transfer.transfer_id,
            'from_member_id', transfer.from_member_id,
            'to_member_id', transfer.to_member_id,
            'amount', transfer.amount,
            'sort_order', transfer.sort_order
          )
          order by transfer.sort_order
        )
        from public.evenup_transfers transfer
        where transfer.group_id = target_group_id
          and transfer.transfer_batch_id = target_transfer_batch_id
      ),
      '[]'::jsonb
    ),
    'allocations', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'payment_id', allocation.payment_id,
            'description', payment.description,
            'member_id', allocation.member_id,
            'allocated_amount', allocation.allocated_amount,
            'sort_order', allocation.sort_order
          )
          order by allocation.sort_order
        )
        from public.evenup_transfer_allocations allocation
        join public.evenup_payments payment
          on payment.group_id = allocation.group_id
          and payment.payment_id = allocation.payment_id
        where allocation.group_id = target_group_id
          and allocation.transfer_batch_id = target_transfer_batch_id
      ),
      '[]'::jsonb
    )
  )
  from public.evenup_transfer_batches transfer_batch
  where transfer_batch.group_id = target_group_id
    and transfer_batch.transfer_batch_id = target_transfer_batch_id;
$$;

create or replace function public.evenup_transfers_create_direct(
  p_group_id text,
  p_request_id uuid,
  p_route_key text,
  p_from_member_id text,
  p_to_member_id text,
  p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_batch_id uuid;
  v_route record;
  v_offset_debt_count integer;
  v_allocation_total bigint;
begin
  if p_request_id is null then
    return private.evenup_error('VALIDATION_ERROR', 'リクエストIDが必要です。');
  end if;

  if v_actor_user_id is null or not private.is_active_group_member(p_group_id) then
    return private.evenup_error('FORBIDDEN', 'このグループの利用権限がありません。');
  end if;

  perform private.lock_evenup_ledger(p_group_id);

  select transfer_batch.transfer_batch_id
  into v_batch_id
  from public.evenup_transfer_batches transfer_batch
  where transfer_batch.group_id = p_group_id
    and transfer_batch.created_by_user_id = v_actor_user_id
    and transfer_batch.request_id = p_request_id;

  if v_batch_id is not null then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'transfer_batch', private.transfer_batch_to_json(p_group_id, v_batch_id),
        'idempotent_replay', true
      )
    );
  end if;

  if p_from_member_id is null or p_to_member_id is null
    or p_from_member_id = p_to_member_id then
    return private.evenup_error('VALIDATION_ERROR', '精算元と精算先を確認してください。');
  end if;

  select route.*
  into v_route
  from private.evenup_direct_route(
    p_group_id,
    p_from_member_id,
    p_to_member_id
  ) route;

  if not found then
    return private.evenup_error('DIRECT_ROUTE_CONFLICT', '個別精算の内容が更新されました。');
  end if;

  if v_route.route_key is distinct from p_route_key then
    return private.evenup_error('DIRECT_ROUTE_CONFLICT', '個別精算の内容が更新されました。');
  end if;

  if p_amount is null or p_amount < 0 or p_amount > v_route.remaining_amount
    or (v_route.remaining_amount > 0 and p_amount < 1) then
    return private.evenup_error('VALIDATION_ERROR', '精算金額を確認してください。');
  end if;

  insert into public.evenup_transfer_batches (
    group_id,
    request_id,
    mode,
    status,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    p_group_id,
    p_request_id,
    'DIRECT',
    'ACTIVE',
    v_actor_user_id,
    v_actor_user_id
  )
  returning transfer_batch_id into v_batch_id;

  insert into public.evenup_transfers (
    group_id,
    transfer_batch_id,
    from_member_id,
    to_member_id,
    amount,
    sort_order
  )
  values (
    p_group_id,
    v_batch_id,
    p_from_member_id,
    p_to_member_id,
    p_amount,
    1
  );

  select count(*)
  into v_offset_debt_count
  from private.evenup_open_debts(p_group_id) debt
  where debt.remaining_amount > 0
    and debt.debtor_member_id = p_to_member_id
    and debt.creditor_member_id = p_from_member_id;

  with offset_ordered as (
    select
      debt.*,
      pg_catalog.row_number() over (
        order by debt.paid_at, debt.payment_id::text,
          debt.debtor_member_id, debt.creditor_member_id
      )::integer as debt_order
    from private.evenup_open_debts(p_group_id) debt
    where debt.remaining_amount > 0
      and debt.debtor_member_id = p_to_member_id
      and debt.creditor_member_id = p_from_member_id
  ),
  primary_ordered as (
    select
      debt.*,
      pg_catalog.row_number() over (
        order by debt.paid_at, debt.payment_id::text,
          debt.debtor_member_id, debt.creditor_member_id
      )::integer as debt_order,
      coalesce(
        pg_catalog.sum(debt.remaining_amount) over (
          order by debt.paid_at, debt.payment_id::text,
            debt.debtor_member_id, debt.creditor_member_id
          rows between unbounded preceding and 1 preceding
        ),
        0::numeric
      )::bigint as allocated_before
    from private.evenup_open_debts(p_group_id) debt
    where debt.remaining_amount > 0
      and debt.debtor_member_id = p_from_member_id
      and debt.creditor_member_id = p_to_member_id
  ),
  candidate_allocations as (
    select
      offset_ordered.payment_id,
      offset_ordered.debtor_member_id as member_id,
      offset_ordered.remaining_amount as allocated_amount,
      offset_ordered.debt_order as sort_order
    from offset_ordered

    union all

    select
      primary_ordered.payment_id,
      primary_ordered.debtor_member_id as member_id,
      least(
        primary_ordered.remaining_amount,
        greatest(
          v_route.offset_amount + p_amount - primary_ordered.allocated_before,
          0::bigint
        )
      ) as allocated_amount,
      v_offset_debt_count + primary_ordered.debt_order as sort_order
    from primary_ordered
  )
  insert into public.evenup_transfer_allocations (
    group_id,
    transfer_batch_id,
    payment_id,
    member_id,
    allocated_amount,
    sort_order
  )
  select
    p_group_id,
    v_batch_id,
    candidate.payment_id,
    candidate.member_id,
    candidate.allocated_amount,
    candidate.sort_order
  from candidate_allocations candidate
  where candidate.allocated_amount > 0
  order by candidate.sort_order;

  select coalesce(pg_catalog.sum(allocation.allocated_amount), 0::numeric)::bigint
  into v_allocation_total
  from public.evenup_transfer_allocations allocation
  where allocation.group_id = p_group_id
    and allocation.transfer_batch_id = v_batch_id;

  if v_allocation_total <> (v_route.offset_amount * 2 + p_amount) then
    raise exception 'Direct settlement allocation invariant failed';
  end if;

  insert into public.evenup_audit_events (
    group_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    after_data
  )
  values (
    p_group_id,
    v_actor_user_id,
    'TRANSFER_CREATE_DIRECT',
    'TRANSFER_BATCH',
    v_batch_id::text,
    p_request_id,
    private.transfer_batch_to_json(p_group_id, v_batch_id)
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'transfer_batch', private.transfer_batch_to_json(p_group_id, v_batch_id),
      'idempotent_replay', false
    )
  );
end;
$$;

create or replace function public.evenup_transfers_create_optimized(
  p_group_id text,
  p_request_id uuid,
  p_snapshot_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_batch_id uuid;
  v_current_snapshot text;
  v_open_debt_total bigint;
  v_allocation_total bigint;
begin
  if p_request_id is null then
    return private.evenup_error('VALIDATION_ERROR', 'リクエストIDが必要です。');
  end if;

  if v_actor_user_id is null or not private.is_active_group_member(p_group_id) then
    return private.evenup_error('FORBIDDEN', 'このグループの利用権限がありません。');
  end if;

  perform private.lock_evenup_ledger(p_group_id);

  select transfer_batch.transfer_batch_id
  into v_batch_id
  from public.evenup_transfer_batches transfer_batch
  where transfer_batch.group_id = p_group_id
    and transfer_batch.created_by_user_id = v_actor_user_id
    and transfer_batch.request_id = p_request_id;

  if v_batch_id is not null then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'transfer_batch', private.transfer_batch_to_json(p_group_id, v_batch_id),
        'idempotent_replay', true
      )
    );
  end if;

  select coalesce(pg_catalog.sum(debt.remaining_amount), 0::numeric)::bigint
  into v_open_debt_total
  from private.evenup_open_debts(p_group_id) debt
  where debt.remaining_amount > 0;

  if v_open_debt_total = 0 then
    return private.evenup_error('NO_OPEN_DEBTS', '未精算の残額はありません。');
  end if;

  v_current_snapshot := private.evenup_snapshot_token(p_group_id);
  if p_snapshot_token is null or p_snapshot_token <> v_current_snapshot then
    return private.evenup_error('SNAPSHOT_CONFLICT', '精算内容が更新されました。');
  end if;

  insert into public.evenup_transfer_batches (
    group_id,
    request_id,
    mode,
    status,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    p_group_id,
    p_request_id,
    'OPTIMIZED',
    'ACTIVE',
    v_actor_user_id,
    v_actor_user_id
  )
  returning transfer_batch_id into v_batch_id;

  insert into public.evenup_transfers (
    group_id,
    transfer_batch_id,
    from_member_id,
    to_member_id,
    amount,
    sort_order
  )
  select
    p_group_id,
    v_batch_id,
    route.from_member_id,
    route.to_member_id,
    route.amount,
    route.sort_order
  from private.evenup_optimized_routes(p_group_id) route;

  insert into public.evenup_transfer_allocations (
    group_id,
    transfer_batch_id,
    payment_id,
    member_id,
    allocated_amount,
    sort_order
  )
  select
    p_group_id,
    v_batch_id,
    debt.payment_id,
    debt.debtor_member_id,
    debt.remaining_amount,
    pg_catalog.row_number() over (
      order by debt.payment_id::text, debt.debtor_member_id
    )::integer
  from private.evenup_open_debts(p_group_id) debt
  where debt.remaining_amount > 0;

  select coalesce(pg_catalog.sum(allocation.allocated_amount), 0::numeric)::bigint
  into v_allocation_total
  from public.evenup_transfer_allocations allocation
  where allocation.group_id = p_group_id
    and allocation.transfer_batch_id = v_batch_id;

  if v_allocation_total <> v_open_debt_total then
    raise exception 'Optimized settlement allocation invariant failed';
  end if;

  insert into public.evenup_audit_events (
    group_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    after_data
  )
  values (
    p_group_id,
    v_actor_user_id,
    'TRANSFER_CREATE_OPTIMIZED',
    'TRANSFER_BATCH',
    v_batch_id::text,
    p_request_id,
    private.transfer_batch_to_json(p_group_id, v_batch_id)
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'transfer_batch', private.transfer_batch_to_json(p_group_id, v_batch_id),
      'idempotent_replay', false
    )
  );
end;
$$;

create or replace function public.evenup_transfers_cancel_latest(
  p_group_id text,
  p_request_id uuid,
  p_transfer_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_batch public.evenup_transfer_batches%rowtype;
  v_latest_batch_id uuid;
  v_replayed_batch_id uuid;
  v_before jsonb;
begin
  if p_request_id is null or p_transfer_batch_id is null then
    return private.evenup_error('VALIDATION_ERROR', '必要な取消情報が不足しています。');
  end if;

  if v_actor_user_id is null or not private.is_active_group_member(p_group_id) then
    return private.evenup_error('FORBIDDEN', 'このグループの利用権限がありません。');
  end if;

  perform private.lock_evenup_ledger(p_group_id);

  select audit.entity_id::uuid
  into v_replayed_batch_id
  from public.evenup_audit_events audit
  where audit.group_id = p_group_id
    and audit.actor_user_id = v_actor_user_id
    and audit.action = 'TRANSFER_CANCEL'
    and audit.request_id = p_request_id;

  if v_replayed_batch_id is not null then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'cancelled_transfer_batch', private.transfer_batch_to_json(
          p_group_id,
          v_replayed_batch_id
        ),
        'idempotent_replay', true
      )
    );
  end if;

  select transfer_batch.*
  into v_batch
  from public.evenup_transfer_batches transfer_batch
  where transfer_batch.group_id = p_group_id
    and transfer_batch.transfer_batch_id = p_transfer_batch_id
  for update;

  if not found then
    return private.evenup_error('TRANSFER_BATCH_NOT_FOUND', '精算記録が見つかりません。');
  end if;

  if not private.can_manage_record(p_group_id, v_batch.created_by_user_id) then
    return private.evenup_error('FORBIDDEN', '他のメンバーが作成した精算は取り消せません。');
  end if;

  if v_batch.status = 'CANCELLED' then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'cancelled_transfer_batch', private.transfer_batch_to_json(
          p_group_id,
          p_transfer_batch_id
        ),
        'idempotent_replay', true
      )
    );
  end if;

  select transfer_batch.transfer_batch_id
  into v_latest_batch_id
  from public.evenup_transfer_batches transfer_batch
  where transfer_batch.group_id = p_group_id
    and transfer_batch.status = 'ACTIVE'
  order by transfer_batch.transferred_at desc, transfer_batch.transfer_batch_id desc
  limit 1;

  if v_latest_batch_id is null or v_latest_batch_id <> p_transfer_batch_id then
    return private.evenup_error(
      'TRANSFER_BATCH_NOT_LATEST',
      '取り消せるのは直前の精算記録だけです。'
    );
  end if;

  v_before := private.transfer_batch_to_json(p_group_id, p_transfer_batch_id);

  update public.evenup_transfer_batches transfer_batch
  set
    status = 'CANCELLED',
    cancelled_at = pg_catalog.now(),
    cancelled_by_user_id = v_actor_user_id,
    updated_by_user_id = v_actor_user_id
  where transfer_batch.group_id = p_group_id
    and transfer_batch.transfer_batch_id = p_transfer_batch_id
  returning transfer_batch.* into v_batch;

  insert into public.evenup_audit_events (
    group_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    before_data,
    after_data
  )
  values (
    p_group_id,
    v_actor_user_id,
    'TRANSFER_CANCEL',
    'TRANSFER_BATCH',
    p_transfer_batch_id::text,
    p_request_id,
    v_before,
    private.transfer_batch_to_json(p_group_id, p_transfer_batch_id)
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'cancelled_transfer_batch', private.transfer_batch_to_json(
        p_group_id,
        p_transfer_batch_id
      ),
      'idempotent_replay', false
    )
  );
end;
$$;

revoke all on function private.evenup_open_debts(text)
  from public, anon, authenticated, service_role;
revoke all on function private.evenup_snapshot_token(text)
  from public, anon, authenticated, service_role;
revoke all on function private.evenup_direct_route(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.evenup_optimized_routes(text)
  from public, anon, authenticated, service_role;
revoke all on function private.transfer_batch_to_json(text, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.evenup_transfers_create_direct(text, uuid, text, text, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.evenup_transfers_create_optimized(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.evenup_transfers_cancel_latest(text, uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.evenup_transfers_create_direct(text, uuid, text, text, text, bigint)
  to authenticated;
grant execute on function public.evenup_transfers_create_optimized(text, uuid, text)
  to authenticated;
grant execute on function public.evenup_transfers_cancel_latest(text, uuid, uuid)
  to authenticated;

commit;
