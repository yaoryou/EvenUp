begin;

create or replace function private.evenup_direct_routes_json(target_group_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_agg(route_item.value order by route_item.from_member_id, route_item.to_member_id),
    '[]'::jsonb
  )
  from (
    select
      from_member.member_id as from_member_id,
      to_member.member_id as to_member_id,
      pg_catalog.jsonb_build_object(
        'route_key', route.route_key,
        'from_member_id', from_member.member_id,
        'to_member_id', to_member.member_id,
        'remaining_amount', route.remaining_amount,
        'offset_amount', route.offset_amount,
        'is_offset_only', route.is_offset_only,
        'debts', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'payment_id', debt.payment_id,
              'from_member_id', debt.debtor_member_id,
              'to_member_id', debt.creditor_member_id,
              'side', debt.side,
              'description', debt.description,
              'paid_at', debt.paid_at,
              'remaining_amount', debt.remaining_amount
            ) order by debt.side_order, debt.paid_at, debt.payment_id::text
          )
          from (
            select 1 as side_order, 'PRIMARY'::text as side, open_debt.*
            from private.evenup_open_debts(target_group_id) open_debt
            where open_debt.remaining_amount > 0
              and open_debt.debtor_member_id = from_member.member_id
              and open_debt.creditor_member_id = to_member.member_id

            union all

            select 2 as side_order, 'OFFSET'::text as side, open_debt.*
            from private.evenup_open_debts(target_group_id) open_debt
            where open_debt.remaining_amount > 0
              and open_debt.debtor_member_id = to_member.member_id
              and open_debt.creditor_member_id = from_member.member_id
          ) debt
        ), '[]'::jsonb)
      ) as value
    from public.evenup_members from_member
    cross join public.evenup_members to_member
    cross join lateral private.evenup_direct_route(
      target_group_id,
      from_member.member_id,
      to_member.member_id
    ) route
    where from_member.group_id = target_group_id
      and to_member.group_id = target_group_id
      and from_member.member_id <> to_member.member_id
  ) route_item;
$$;

create or replace function private.evenup_preview_json(target_group_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'current_user', (
      select pg_catalog.jsonb_build_object(
        'member_id', membership.member_id,
        'role', membership.role
      )
      from public.evenup_group_memberships membership
      where membership.group_id = target_group_id
        and membership.user_id = (select auth.uid())
        and membership.active
    ),
    'members', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'member_id', member.member_id,
          'name', member.name,
          'active', member.active,
          'sort_order', member.sort_order
        ) order by member.sort_order, member.member_id
      )
      from public.evenup_members member
      where member.group_id = target_group_id
    ), '[]'::jsonb),
    'open_payments', coalesce((
      select pg_catalog.jsonb_agg(
        private.payment_to_json(target_group_id, payment.payment_id)
        order by payment.paid_at desc, payment.payment_id desc
      )
      from public.evenup_payments payment
      where payment.group_id = target_group_id
        and payment.cancelled_at is null
        and exists (
          select 1
          from private.evenup_open_debts(target_group_id) debt
          where debt.payment_id = payment.payment_id
            and debt.remaining_amount > 0
        )
    ), '[]'::jsonb),
    'balances', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'member_id', balance.member_id,
          'balance', balance.amount
        ) order by balance.member_id
      )
      from (
        select change.member_id, pg_catalog.sum(change.amount)::bigint as amount
        from (
          select debt.creditor_member_id as member_id, debt.remaining_amount as amount
          from private.evenup_open_debts(target_group_id) debt
          where debt.remaining_amount > 0

          union all

          select debt.debtor_member_id as member_id, -debt.remaining_amount as amount
          from private.evenup_open_debts(target_group_id) debt
          where debt.remaining_amount > 0
        ) change
        group by change.member_id
      ) balance
    ), '[]'::jsonb),
    'direct_routes', private.evenup_direct_routes_json(target_group_id),
    'optimized_routes', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'from_member_id', route.from_member_id,
          'to_member_id', route.to_member_id,
          'amount', route.amount,
          'sort_order', route.sort_order
        ) order by route.sort_order
      )
      from private.evenup_optimized_routes(target_group_id) route
    ), '[]'::jsonb),
    'optimized_snapshot_token', private.evenup_snapshot_token(target_group_id),
    'latest_cancellable_transfer_batch', (
      select private.transfer_batch_to_json(target_group_id, transfer_batch.transfer_batch_id)
      from public.evenup_transfer_batches transfer_batch
      where transfer_batch.group_id = target_group_id
        and transfer_batch.status = 'ACTIVE'
        and private.can_manage_record(target_group_id, transfer_batch.created_by_user_id)
      order by transfer_batch.transferred_at desc, transfer_batch.transfer_batch_id desc
      limit 1
    )
  );
$$;

create or replace function public.evenup_bootstrap(p_group_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_active_group_member(p_group_id) then
    return private.evenup_error('FORBIDDEN', 'このグループの利用権限がありません。');
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', private.evenup_preview_json(p_group_id)
  );
end;
$$;

create or replace function public.evenup_settlement_preview(p_group_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_active_group_member(p_group_id) then
    return private.evenup_error('FORBIDDEN', 'このグループの利用権限がありません。');
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', private.evenup_preview_json(p_group_id)
  );
end;
$$;

create or replace function public.evenup_history_list(
  p_group_id text,
  p_type text default 'ALL',
  p_cursor text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text := pg_catalog.upper(coalesce(p_type, 'ALL'));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20);
  v_offset integer := 0;
  v_total integer;
  v_items jsonb;
begin
  if (select auth.uid()) is null or not private.is_active_group_member(p_group_id) then
    return private.evenup_error('FORBIDDEN', 'このグループの利用権限がありません。');
  end if;

  if v_type not in ('ALL', 'PAYMENT', 'TRANSFER') then
    v_type := 'ALL';
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^[0-9]+$' then
      return private.evenup_error('VALIDATION_ERROR', '履歴カーソルが不正です。');
    end if;
    v_offset := p_cursor::integer;
  end if;

  with history_items as (
    select
      'PAYMENT'::text as type,
      payment.paid_at as occurred_at,
      1 as type_order,
      payment.payment_id::text as entity_id,
      pg_catalog.jsonb_build_object(
        'type', 'PAYMENT',
        'occurred_at', payment.paid_at,
        'payment', private.payment_to_json(p_group_id, payment.payment_id)
      ) as value
    from public.evenup_payments payment
    where payment.group_id = p_group_id
      and v_type in ('ALL', 'PAYMENT')

    union all

    select
      'TRANSFER'::text as type,
      transfer_batch.transferred_at as occurred_at,
      2 as type_order,
      transfer_batch.transfer_batch_id::text as entity_id,
      pg_catalog.jsonb_build_object(
        'type', 'TRANSFER',
        'occurred_at', transfer_batch.transferred_at,
        'transfer_batch', private.transfer_batch_to_json(
          p_group_id,
          transfer_batch.transfer_batch_id
        )
      ) as value
    from public.evenup_transfer_batches transfer_batch
    where transfer_batch.group_id = p_group_id
      and v_type in ('ALL', 'TRANSFER')
  ),
  ordered as (
    select history_items.*
    from history_items
    order by occurred_at desc, type_order desc, entity_id desc
  ),
  page as (
    select ordered.*
    from ordered
    offset v_offset
    limit v_limit
  )
  select
    (select count(*) from ordered),
    coalesce((select pg_catalog.jsonb_agg(page.value order by page.occurred_at desc, page.type_order desc, page.entity_id desc) from page), '[]'::jsonb)
  into v_total, v_items;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'items', v_items,
      'next_cursor', case when v_offset + v_limit < v_total then (v_offset + v_limit)::text else null end,
      'has_more', v_offset + v_limit < v_total
    )
  );
end;
$$;

revoke all on function private.evenup_direct_routes_json(text)
  from public, anon, authenticated, service_role;
revoke all on function private.evenup_preview_json(text)
  from public, anon, authenticated, service_role;

revoke all on function public.evenup_bootstrap(text)
  from public, anon, authenticated, service_role;
revoke all on function public.evenup_settlement_preview(text)
  from public, anon, authenticated, service_role;
revoke all on function public.evenup_history_list(text, text, text, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.evenup_bootstrap(text) to authenticated;
grant execute on function public.evenup_settlement_preview(text) to authenticated;
grant execute on function public.evenup_history_list(text, text, text, integer) to authenticated;

commit;
