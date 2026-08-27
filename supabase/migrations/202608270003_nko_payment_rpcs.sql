begin;

alter table public.evenup_transfer_allocations
  drop constraint evenup_transfer_allocations_share_fk;

alter table public.evenup_transfer_allocations
  add constraint evenup_transfer_allocations_payment_fk
    foreign key (group_id, payment_id)
    references public.evenup_payments (group_id, payment_id)
    on update restrict
    on delete restrict,
  add constraint evenup_transfer_allocations_member_fk
    foreign key (group_id, member_id)
    references public.evenup_members (group_id, member_id)
    on update restrict
    on delete restrict;

create unique index evenup_audit_events_request_idempotency_idx
  on public.evenup_audit_events (group_id, actor_user_id, action, request_id)
  where request_id is not null;

create or replace function private.evenup_error(
  error_code text,
  error_message text,
  retryable boolean default false
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'ok', false,
    'error', pg_catalog.jsonb_build_object(
      'code', error_code,
      'message', error_message,
      'fields', '{}'::jsonb,
      'retryable', retryable
    )
  );
$$;

create or replace function private.payment_to_json(
  target_group_id text,
  target_payment_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with share_stats as (
    select
      share.member_id,
      share.share_amount,
      coalesce(
        pg_catalog.sum(allocation.allocated_amount) filter (
          where transfer_batch.status = 'ACTIVE'
        ),
        0::numeric
      )::bigint as allocated_amount
    from public.evenup_payment_shares share
    left join public.evenup_transfer_allocations allocation
      on allocation.group_id = share.group_id
      and allocation.payment_id = share.payment_id
      and allocation.member_id = share.member_id
    left join public.evenup_transfer_batches transfer_batch
      on transfer_batch.group_id = allocation.group_id
      and transfer_batch.transfer_batch_id = allocation.transfer_batch_id
    where share.group_id = target_group_id
      and share.payment_id = target_payment_id
    group by share.member_id, share.share_amount
  ),
  payment_totals as (
    select
      coalesce(
        pg_catalog.sum(
          case when share_stats.member_id <> payment.paid_by
            then share_stats.share_amount
            else 0
          end
        ),
        0::numeric
      )::bigint as settleable_amount,
      coalesce(
        pg_catalog.sum(
          case when share_stats.member_id <> payment.paid_by
            then share_stats.allocated_amount
            else 0
          end
        ),
        0::numeric
      )::bigint as allocated_amount
    from public.evenup_payments payment
    left join share_stats on true
    where payment.group_id = target_group_id
      and payment.payment_id = target_payment_id
    group by payment.paid_by
  )
  select pg_catalog.jsonb_build_object(
    'payment_id', payment.payment_id,
    'paid_at', payment.paid_at,
    'description', payment.description,
    'paid_by', payment.paid_by,
    'amount', payment.amount,
    'status', case
      when payment.cancelled_at is not null then 'CANCELLED'
      when totals.settleable_amount = 0
        or totals.allocated_amount = totals.settleable_amount then 'SETTLED'
      when totals.allocated_amount = 0 then 'UNSETTLED'
      else 'PARTIALLY_SETTLED'
    end,
    'settleable_amount', totals.settleable_amount,
    'allocated_amount', totals.allocated_amount,
    'remaining_amount', greatest(
      totals.settleable_amount - totals.allocated_amount,
      0
    ),
    'cancelled_at', payment.cancelled_at,
    'created_at', payment.created_at,
    'updated_at', payment.updated_at,
    'shares', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'member_id', share_stats.member_id,
            'share_amount', share_stats.share_amount,
            'allocated_amount', case
              when share_stats.member_id = payment.paid_by then 0
              else share_stats.allocated_amount
            end,
            'remaining_amount', case
              when share_stats.member_id = payment.paid_by then 0
              else greatest(
                share_stats.share_amount - share_stats.allocated_amount,
                0
              )
            end
          )
          order by share_stats.member_id
        )
        from share_stats
      ),
      '[]'::jsonb
    )
  )
  from public.evenup_payments payment
  cross join payment_totals totals
  where payment.group_id = target_group_id
    and payment.payment_id = target_payment_id;
$$;

create or replace function public.evenup_payments_create(
  p_group_id text,
  p_request_id uuid,
  p_description text,
  p_amount bigint,
  p_paid_by text,
  p_target_member_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_description text;
  v_paid_by text;
  v_target_member_ids text[];
  v_target_count bigint;
  v_payment_id uuid;
begin
  if p_request_id is null then
    return private.evenup_error('VALIDATION_ERROR', 'リクエストIDが必要です。');
  end if;

  if v_actor_user_id is null or not private.is_active_group_member(p_group_id) then
    return private.evenup_error('FORBIDDEN', 'このグループの利用権限がありません。');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_group_id || ':' || v_actor_user_id::text || ':PAYMENT_CREATE:' || p_request_id::text,
      0
    )
  );

  select payment.payment_id
  into v_payment_id
  from public.evenup_payments payment
  where payment.group_id = p_group_id
    and payment.created_by_user_id = v_actor_user_id
    and payment.request_id = p_request_id;

  if v_payment_id is not null then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'payment', private.payment_to_json(p_group_id, v_payment_id),
        'idempotent_replay', true
      )
    );
  end if;

  v_description := pg_catalog.btrim(coalesce(p_description, ''));
  v_paid_by := pg_catalog.btrim(coalesce(p_paid_by, ''));

  if pg_catalog.char_length(v_description) not between 1 and 100 then
    return private.evenup_error('VALIDATION_ERROR', '支払い内容を1〜100文字で入力してください。');
  end if;

  if p_amount is null or p_amount not between 1 and 99999999 then
    return private.evenup_error('VALIDATION_ERROR', '1円以上の整数金額を入力してください。');
  end if;

  select coalesce(
    pg_catalog.array_agg(distinct pg_catalog.btrim(target.member_id)
      order by pg_catalog.btrim(target.member_id)),
    '{}'::text[]
  )
  into v_target_member_ids
  from pg_catalog.unnest(coalesce(p_target_member_ids, '{}'::text[]))
    as target(member_id);

  v_target_count := pg_catalog.cardinality(v_target_member_ids);
  if v_target_count = 0 then
    return private.evenup_error('VALIDATION_ERROR', '対象メンバーを選択してください。');
  end if;

  if not exists (
    select 1
    from public.evenup_members member
    where member.group_id = p_group_id
      and member.member_id = v_paid_by
      and member.active
  ) or exists (
    select 1
    from pg_catalog.unnest(v_target_member_ids) as target(member_id)
    left join public.evenup_members member
      on member.group_id = p_group_id
      and member.member_id = target.member_id
      and member.active
    where member.member_id is null
  ) then
    return private.evenup_error('MEMBER_INACTIVE', '無効なメンバーが含まれています。');
  end if;

  insert into public.evenup_payments (
    group_id,
    request_id,
    description,
    paid_by,
    amount,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    p_group_id,
    p_request_id,
    v_description,
    v_paid_by,
    p_amount,
    v_actor_user_id,
    v_actor_user_id
  )
  returning payment_id into v_payment_id;

  insert into public.evenup_payment_shares (
    group_id,
    payment_id,
    member_id,
    share_amount
  )
  select
    p_group_id,
    v_payment_id,
    ordered_target.member_id,
    (p_amount / v_target_count)
      + case when ordered_target.remainder_order <= (p_amount % v_target_count)
        then 1
        else 0
      end
  from (
    select
      target.member_id,
      pg_catalog.row_number() over (
        order by (target.member_id = v_paid_by), target.member_id
      ) as remainder_order
    from pg_catalog.unnest(v_target_member_ids) as target(member_id)
  ) ordered_target;

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
    'PAYMENT_CREATE',
    'PAYMENT',
    v_payment_id::text,
    p_request_id,
    private.payment_to_json(p_group_id, v_payment_id)
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'payment', private.payment_to_json(p_group_id, v_payment_id),
      'idempotent_replay', false
    )
  );
end;
$$;

create or replace function public.evenup_payments_update(
  p_group_id text,
  p_request_id uuid,
  p_payment_id uuid,
  p_expected_updated_at timestamptz,
  p_description text,
  p_amount bigint,
  p_paid_by text,
  p_target_member_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_description text;
  v_paid_by text;
  v_target_member_ids text[];
  v_target_count bigint;
  v_payment public.evenup_payments%rowtype;
  v_replayed_payment_id uuid;
  v_before jsonb;
begin
  if p_request_id is null or p_payment_id is null or p_expected_updated_at is null then
    return private.evenup_error('VALIDATION_ERROR', '必要な更新情報が不足しています。');
  end if;

  if v_actor_user_id is null or not private.is_active_group_member(p_group_id) then
    return private.evenup_error('FORBIDDEN', 'このグループの利用権限がありません。');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_group_id || ':' || v_actor_user_id::text || ':PAYMENT_UPDATE:' || p_request_id::text,
      0
    )
  );

  select audit.entity_id::uuid
  into v_replayed_payment_id
  from public.evenup_audit_events audit
  where audit.group_id = p_group_id
    and audit.actor_user_id = v_actor_user_id
    and audit.action = 'PAYMENT_UPDATE'
    and audit.request_id = p_request_id;

  if v_replayed_payment_id is not null then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'payment', private.payment_to_json(p_group_id, v_replayed_payment_id),
        'idempotent_replay', true
      )
    );
  end if;

  select payment.*
  into v_payment
  from public.evenup_payments payment
  where payment.group_id = p_group_id
    and payment.payment_id = p_payment_id
  for update;

  if not found then
    return private.evenup_error('PAYMENT_NOT_FOUND', '支払いが見つかりません。');
  end if;

  if not private.can_manage_record(p_group_id, v_payment.created_by_user_id) then
    return private.evenup_error('FORBIDDEN', '他のメンバーが作成した支払いは変更できません。');
  end if;

  if v_payment.cancelled_at is not null then
    return private.evenup_error('VALIDATION_ERROR', '取消済みの支払いは変更できません。');
  end if;

  if v_payment.updated_at <> p_expected_updated_at then
    return private.evenup_error('EDIT_CONFLICT', '支払いが別の端末で更新されました。');
  end if;

  if exists (
    select 1
    from public.evenup_transfer_allocations allocation
    join public.evenup_transfer_batches transfer_batch
      on transfer_batch.group_id = allocation.group_id
      and transfer_batch.transfer_batch_id = allocation.transfer_batch_id
    where allocation.group_id = p_group_id
      and allocation.payment_id = p_payment_id
      and transfer_batch.status = 'ACTIVE'
      and allocation.allocated_amount > 0
  ) then
    return private.evenup_error(
      'PAYMENT_HAS_ALLOCATIONS',
      '精算済みの金額があるため、先に最新の精算記録を取り消してください。'
    );
  end if;

  v_description := pg_catalog.btrim(coalesce(p_description, ''));
  v_paid_by := pg_catalog.btrim(coalesce(p_paid_by, ''));

  if pg_catalog.char_length(v_description) not between 1 and 100 then
    return private.evenup_error('VALIDATION_ERROR', '支払い内容を1〜100文字で入力してください。');
  end if;

  if p_amount is null or p_amount not between 1 and 99999999 then
    return private.evenup_error('VALIDATION_ERROR', '1円以上の整数金額を入力してください。');
  end if;

  select coalesce(
    pg_catalog.array_agg(distinct pg_catalog.btrim(target.member_id)
      order by pg_catalog.btrim(target.member_id)),
    '{}'::text[]
  )
  into v_target_member_ids
  from pg_catalog.unnest(coalesce(p_target_member_ids, '{}'::text[]))
    as target(member_id);

  v_target_count := pg_catalog.cardinality(v_target_member_ids);
  if v_target_count = 0 then
    return private.evenup_error('VALIDATION_ERROR', '対象メンバーを選択してください。');
  end if;

  if not exists (
    select 1
    from public.evenup_members member
    where member.group_id = p_group_id
      and member.member_id = v_paid_by
      and member.active
  ) or exists (
    select 1
    from pg_catalog.unnest(v_target_member_ids) as target(member_id)
    left join public.evenup_members member
      on member.group_id = p_group_id
      and member.member_id = target.member_id
      and member.active
    where member.member_id is null
  ) then
    return private.evenup_error('MEMBER_INACTIVE', '無効なメンバーが含まれています。');
  end if;

  v_before := private.payment_to_json(p_group_id, p_payment_id);

  update public.evenup_payments payment
  set
    description = v_description,
    amount = p_amount,
    paid_by = v_paid_by,
    updated_by_user_id = v_actor_user_id
  where payment.group_id = p_group_id
    and payment.payment_id = p_payment_id
  returning payment.* into v_payment;

  delete from public.evenup_payment_shares share
  where share.group_id = p_group_id
    and share.payment_id = p_payment_id;

  insert into public.evenup_payment_shares (
    group_id,
    payment_id,
    member_id,
    share_amount
  )
  select
    p_group_id,
    p_payment_id,
    ordered_target.member_id,
    (p_amount / v_target_count)
      + case when ordered_target.remainder_order <= (p_amount % v_target_count)
        then 1
        else 0
      end
  from (
    select
      target.member_id,
      pg_catalog.row_number() over (
        order by (target.member_id = v_paid_by), target.member_id
      ) as remainder_order
    from pg_catalog.unnest(v_target_member_ids) as target(member_id)
  ) ordered_target;

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
    'PAYMENT_UPDATE',
    'PAYMENT',
    p_payment_id::text,
    p_request_id,
    v_before,
    private.payment_to_json(p_group_id, p_payment_id)
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'payment', private.payment_to_json(p_group_id, p_payment_id),
      'idempotent_replay', false
    )
  );
end;
$$;

create or replace function public.evenup_payments_cancel(
  p_group_id text,
  p_request_id uuid,
  p_payment_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_payment public.evenup_payments%rowtype;
  v_replayed_payment_id uuid;
  v_before jsonb;
begin
  if p_request_id is null or p_payment_id is null or p_expected_updated_at is null then
    return private.evenup_error('VALIDATION_ERROR', '必要な取消情報が不足しています。');
  end if;

  if v_actor_user_id is null or not private.is_active_group_member(p_group_id) then
    return private.evenup_error('FORBIDDEN', 'このグループの利用権限がありません。');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_group_id || ':' || v_actor_user_id::text || ':PAYMENT_CANCEL:' || p_request_id::text,
      0
    )
  );

  select audit.entity_id::uuid
  into v_replayed_payment_id
  from public.evenup_audit_events audit
  where audit.group_id = p_group_id
    and audit.actor_user_id = v_actor_user_id
    and audit.action = 'PAYMENT_CANCEL'
    and audit.request_id = p_request_id;

  if v_replayed_payment_id is not null then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'payment', private.payment_to_json(p_group_id, v_replayed_payment_id),
        'idempotent_replay', true
      )
    );
  end if;

  select payment.*
  into v_payment
  from public.evenup_payments payment
  where payment.group_id = p_group_id
    and payment.payment_id = p_payment_id
  for update;

  if not found then
    return private.evenup_error('PAYMENT_NOT_FOUND', '支払いが見つかりません。');
  end if;

  if not private.can_manage_record(p_group_id, v_payment.created_by_user_id) then
    return private.evenup_error('FORBIDDEN', '他のメンバーが作成した支払いは取り消せません。');
  end if;

  if v_payment.cancelled_at is not null then
    return private.evenup_error('VALIDATION_ERROR', '取消済みの支払いです。');
  end if;

  if v_payment.updated_at <> p_expected_updated_at then
    return private.evenup_error('EDIT_CONFLICT', '支払いが別の端末で更新されました。');
  end if;

  if exists (
    select 1
    from public.evenup_transfer_allocations allocation
    join public.evenup_transfer_batches transfer_batch
      on transfer_batch.group_id = allocation.group_id
      and transfer_batch.transfer_batch_id = allocation.transfer_batch_id
    where allocation.group_id = p_group_id
      and allocation.payment_id = p_payment_id
      and transfer_batch.status = 'ACTIVE'
      and allocation.allocated_amount > 0
  ) then
    return private.evenup_error(
      'PAYMENT_HAS_ALLOCATIONS',
      '精算済みの金額があるため、先に最新の精算記録を取り消してください。'
    );
  end if;

  v_before := private.payment_to_json(p_group_id, p_payment_id);

  update public.evenup_payments payment
  set
    cancelled_at = pg_catalog.now(),
    cancelled_by_user_id = v_actor_user_id,
    updated_by_user_id = v_actor_user_id
  where payment.group_id = p_group_id
    and payment.payment_id = p_payment_id
  returning payment.* into v_payment;

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
    'PAYMENT_CANCEL',
    'PAYMENT',
    p_payment_id::text,
    p_request_id,
    v_before,
    private.payment_to_json(p_group_id, p_payment_id)
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'payment', private.payment_to_json(p_group_id, p_payment_id),
      'idempotent_replay', false
    )
  );
end;
$$;

revoke all on function private.evenup_error(text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.payment_to_json(text, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.evenup_payments_create(text, uuid, text, bigint, text, text[])
  from public, anon, authenticated, service_role;
revoke all on function public.evenup_payments_update(text, uuid, uuid, timestamptz, text, bigint, text, text[])
  from public, anon, authenticated, service_role;
revoke all on function public.evenup_payments_cancel(text, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.evenup_payments_create(text, uuid, text, bigint, text, text[])
  to authenticated;
grant execute on function public.evenup_payments_update(text, uuid, uuid, timestamptz, text, bigint, text, text[])
  to authenticated;
grant execute on function public.evenup_payments_cancel(text, uuid, uuid, timestamptz)
  to authenticated;

commit;
