const members = [
  { member_id: "M001", name: "あおい", active: true, sort_order: 10 },
  { member_id: "M002", name: "れん", active: true, sort_order: 20 },
  { member_id: "M003", name: "みお", active: true, sort_order: 30 }
];

const payments = [
  {
    payment_id: "demo-payment-1",
    request_id: "demo-request-1",
    paid_at: new Date().toISOString(),
    description: "ラーメン",
    paid_by: "M001",
    amount: 1000,
    cancelled_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    shares: [
      { member_id: "M001", share_amount: 333 },
      { member_id: "M002", share_amount: 334 },
      { member_id: "M003", share_amount: 333 }
    ]
  }
];
const batches = [];

function sharesFor(amount, paidBy, targetIds) {
  const targets = [...new Set(targetIds)].sort();
  const base = Math.floor(amount / targets.length);
  let remainder = amount % targets.length;
  const order = [...targets.filter((id) => id !== paidBy), ...targets.filter((id) => id === paidBy)];
  const extras = new Set(order.slice(0, remainder));
  return targets.map((memberId) => ({
    member_id: memberId,
    share_amount: base + (extras.has(memberId) ? 1 : 0)
  }));
}

function activeAllocations() {
  return batches.filter((batch) => batch.status === "ACTIVE").flatMap((batch) => batch.allocations);
}

function debts() {
  const allocations = activeAllocations();
  return payments.flatMap((payment) => {
    if (payment.cancelled_at) return [];
    return payment.shares.flatMap((share) => {
      if (share.member_id === payment.paid_by) return [];
      const allocated = allocations
        .filter((item) => item.payment_id === payment.payment_id && item.member_id === share.member_id)
        .reduce((sum, item) => sum + item.allocated_amount, 0);
      return [{
        payment_id: payment.payment_id,
        description: payment.description,
        paid_at: payment.paid_at,
        debtor_member_id: share.member_id,
        creditor_member_id: payment.paid_by,
        original_amount: share.share_amount,
        allocated_amount: allocated,
        remaining_amount: share.share_amount - allocated
      }];
    });
  });
}

function paymentDto(payment) {
  const related = debts().filter((debt) => debt.payment_id === payment.payment_id);
  const byMember = Object.fromEntries(related.map((debt) => [debt.debtor_member_id, debt]));
  const settleable = related.reduce((sum, debt) => sum + debt.original_amount, 0);
  const allocated = related.reduce((sum, debt) => sum + debt.allocated_amount, 0);
  const status = payment.cancelled_at
    ? "CANCELLED"
    : settleable === 0 || allocated === settleable
      ? "SETTLED"
      : allocated === 0 ? "UNSETTLED" : "PARTIALLY_SETTLED";
  return {
    payment_id: payment.payment_id,
    paid_at: payment.paid_at,
    description: payment.description,
    paid_by: payment.paid_by,
    amount: payment.amount,
    status,
    settleable_amount: settleable,
    allocated_amount: allocated,
    remaining_amount: Math.max(settleable - allocated, 0),
    cancelled_at: payment.cancelled_at,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
    shares: payment.shares.map((share) => ({
      ...share,
      allocated_amount: byMember[share.member_id]?.allocated_amount || 0,
      remaining_amount: byMember[share.member_id]?.remaining_amount || 0
    }))
  };
}

function directRoutes(openDebts) {
  const groups = new Map();
  for (const debt of openDebts.filter((item) => item.remaining_amount > 0)) {
    const members = [debt.debtor_member_id, debt.creditor_member_id].sort();
    const key = `${members[0]}::${members[1]}`;
    if (!groups.has(key)) {
      groups.set(key, {
        members,
        directions: new Map()
      });
    }
    const directionKey = `${debt.debtor_member_id}::${debt.creditor_member_id}`;
    const group = groups.get(key);
    if (!group.directions.has(directionKey)) {
      group.directions.set(directionKey, {
        from_member_id: debt.debtor_member_id,
        to_member_id: debt.creditor_member_id,
        amount: 0,
        debts: []
      });
    }
    const direction = group.directions.get(directionKey);
    direction.amount += debt.remaining_amount;
    direction.debts.push(debt);
  }
  return [...groups.values()].map((group) => {
    const directions = [...group.directions.values()].map((direction) => {
      direction.debts.sort((left, right) =>
        new Date(left.paid_at) - new Date(right.paid_at) ||
        left.payment_id.localeCompare(right.payment_id)
      );
      return direction;
    }).sort((left, right) =>
      right.amount - left.amount ||
      left.from_member_id.localeCompare(right.from_member_id) ||
      left.to_member_id.localeCompare(right.to_member_id)
    );
    const primary = directions[0];
    const offset = directions[1] || {
      from_member_id: primary.to_member_id,
      to_member_id: primary.from_member_id,
      amount: 0,
      debts: []
    };
    const isOffsetOnly = primary.amount === offset.amount;
    const primaryDebts = primary.debts.map((debt) => ({ ...debt, side: "PRIMARY" }));
    const offsetDebts = offset.debts.map((debt) => ({ ...debt, side: "OFFSET" }));
    const routeDebts = [...primaryDebts, ...offsetDebts];
    const remainingAmount = primary.amount - offset.amount;
    const fromMemberId = isOffsetOnly ? group.members[0] : primary.from_member_id;
    const toMemberId = isOffsetOnly ? group.members[1] : primary.to_member_id;
    const routeKey = [
      fromMemberId,
      toMemberId,
      remainingAmount,
      offset.amount,
      routeDebts.map((debt) => [
        debt.side,
        debt.debtor_member_id,
        debt.creditor_member_id,
        debt.payment_id,
        debt.remaining_amount
      ].join(":")).join(",")
    ].join("|");
    return {
      route_key: routeKey,
      from_member_id: fromMemberId,
      to_member_id: toMemberId,
      remaining_amount: remainingAmount,
      offset_amount: offset.amount,
      is_offset_only: isOffsetOnly,
      debts: routeDebts.map((debt) => ({
        payment_id: debt.payment_id,
        from_member_id: debt.debtor_member_id,
        to_member_id: debt.creditor_member_id,
        side: debt.side,
        description: debt.description,
        paid_at: debt.paid_at,
        remaining_amount: debt.remaining_amount
      }))
    };
  }).filter((route) => route.remaining_amount > 0 || route.offset_amount > 0);
}

function optimizedRoutes(openDebts) {
  const balances = {};
  for (const debt of openDebts.filter((item) => item.remaining_amount > 0)) {
    balances[debt.creditor_member_id] = (balances[debt.creditor_member_id] || 0) + debt.remaining_amount;
    balances[debt.debtor_member_id] = (balances[debt.debtor_member_id] || 0) - debt.remaining_amount;
  }
  const compare = (left, right) => right.amount - left.amount || left.member_id.localeCompare(right.member_id);
  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > 0)
    .map(([member_id, amount]) => ({ member_id, amount }))
    .sort(compare);
  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < 0)
    .map(([member_id, amount]) => ({ member_id, amount: -amount }))
    .sort(compare);
  const routes = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);
    routes.push({
      from_member_id: debtor.member_id,
      to_member_id: creditor.member_id,
      amount,
      sort_order: routes.length + 1
    });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (!creditor.amount) creditorIndex += 1;
    if (!debtor.amount) debtorIndex += 1;
  }
  return { routes, balances };
}

function batchDto(batch) {
  return structuredClone(batch);
}

function preview() {
  const openDebts = debts();
  const direct = directRoutes(openDebts);
  const optimized = optimizedRoutes(openDebts);
  const active = batches.filter((batch) => batch.status === "ACTIVE")
    .sort((left, right) => new Date(right.transferred_at) - new Date(left.transferred_at));
  return {
    members,
    open_payments: payments.map(paymentDto).filter((payment) =>
      payment.status === "UNSETTLED" || payment.status === "PARTIALLY_SETTLED"
    ),
    balances: Object.entries(optimized.balances).map(([member_id, balance]) => ({ member_id, balance })),
    direct_routes: direct,
    optimized_routes: optimized.routes,
    optimized_snapshot_token: JSON.stringify(openDebts.map((debt) => [
      debt.payment_id,
      debt.debtor_member_id,
      debt.remaining_amount
    ])),
    latest_cancellable_transfer_batch: active[0] ? batchDto(active[0]) : null
  };
}

function createDirect(payload) {
  const route = directRoutes(debts()).find((item) =>
    item.route_key === payload.route_key &&
    item.from_member_id === payload.from_member_id &&
    item.to_member_id === payload.to_member_id
  );
  if (!route) {
    throw new Error("個別精算の内容が更新されました。");
  }
  const allocations = [];
  function allocate(routeDebts, amount) {
    let remaining = amount;
    for (const debt of routeDebts) {
      if (!remaining) break;
      const allocatedAmount = Math.min(remaining, debt.remaining_amount);
      allocations.push({
        payment_id: debt.payment_id,
        description: debt.description,
        member_id: debt.from_member_id,
        allocated_amount: allocatedAmount,
        sort_order: allocations.length + 1
      });
      remaining -= allocatedAmount;
    }
    if (remaining) throw new Error("個別精算の内容が更新されました。");
  }
  if (!Number.isInteger(payload.amount) || payload.amount < 0 || payload.amount > route.remaining_amount ||
    (route.remaining_amount > 0 && payload.amount < 1)) {
    throw new Error("個別精算の内容が更新されました。");
  }
  allocate(route.debts.filter((debt) => debt.side === "OFFSET"), route.offset_amount || 0);
  allocate(route.debts.filter((debt) => debt.side === "PRIMARY"), (route.offset_amount || 0) + payload.amount);
  allocations.forEach((allocation, index) => {
    allocation.sort_order = index + 1;
  });
  const now = new Date().toISOString();
  const batch = {
    transfer_batch_id: crypto.randomUUID(),
    mode: "DIRECT",
    transferred_at: now,
    status: "ACTIVE",
    cancelled_at: null,
    transfers: [{
      transfer_id: crypto.randomUUID(),
      from_member_id: payload.from_member_id,
      to_member_id: payload.to_member_id,
      amount: payload.amount,
      sort_order: 1
    }],
    allocations
  };
  batches.push(batch);
  return batch;
}

function createOptimized(payload) {
  const current = preview();
  if (payload.snapshot_token !== current.optimized_snapshot_token) {
    throw new Error("精算内容が更新されました。");
  }
  const openDebts = debts().filter((debt) => debt.remaining_amount > 0);
  const now = new Date().toISOString();
  const batch = {
    transfer_batch_id: crypto.randomUUID(),
    mode: "OPTIMIZED",
    transferred_at: now,
    status: "ACTIVE",
    cancelled_at: null,
    transfers: current.optimized_routes.map((route) => ({
      transfer_id: crypto.randomUUID(),
      ...route
    })),
    allocations: openDebts.map((debt, index) => ({
      payment_id: debt.payment_id,
      description: debt.description,
      member_id: debt.debtor_member_id,
      allocated_amount: debt.remaining_amount,
      sort_order: index + 1
    }))
  };
  batches.push(batch);
  return batch;
}

function history(payload) {
  const items = [];
  if (payload.type === "ALL" || payload.type === "PAYMENT") {
    items.push(...payments.map((payment) => ({
      type: "PAYMENT",
      occurred_at: payment.paid_at,
      payment: paymentDto(payment)
    })));
  }
  if (payload.type === "ALL" || payload.type === "TRANSFER") {
    items.push(...batches.map((batch) => ({
      type: "TRANSFER",
      occurred_at: batch.transferred_at,
      transfer_batch: batchDto(batch)
    })));
  }
  items.sort((left, right) => new Date(right.occurred_at) - new Date(left.occurred_at));
  const offset = payload.cursor ? Number(payload.cursor) : 0;
  const limit = Math.min(Number(payload.limit) || 20, 20);
  return {
    items: structuredClone(items.slice(offset, offset + limit)),
    next_cursor: offset + limit < items.length ? String(offset + limit) : null,
    has_more: offset + limit < items.length
  };
}

export async function callDemoApi(action, payload = {}) {
  await new Promise((resolve) => setTimeout(resolve, 120));

  switch (action) {
    case "auth.verify":
      return { authenticated: true };
    case "bootstrap":
    case "settlement.preview":
      return structuredClone(preview());
    case "payments.create": {
      const now = new Date().toISOString();
      const payment = {
        payment_id: crypto.randomUUID(),
        paid_at: now,
        description: payload.description,
        paid_by: payload.paid_by,
        amount: payload.amount,
        cancelled_at: null,
        created_at: now,
        updated_at: now,
        shares: sharesFor(payload.amount, payload.paid_by, payload.target_member_ids)
      };
      payments.push(payment);
      return { payment: paymentDto(payment), idempotent_replay: false };
    }
    case "payments.update": {
      const payment = payments.find((item) => item.payment_id === payload.payment_id);
      if (!payment) throw new Error("支払いが見つかりません。");
      if (paymentDto(payment).allocated_amount > 0) throw new Error("精算済みの金額があります。");
      payment.description = payload.description;
      payment.amount = payload.amount;
      payment.paid_by = payload.paid_by;
      payment.shares = sharesFor(payload.amount, payload.paid_by, payload.target_member_ids);
      payment.updated_at = new Date().toISOString();
      return { payment: paymentDto(payment) };
    }
    case "payments.cancel": {
      const payment = payments.find((item) => item.payment_id === payload.payment_id);
      if (!payment) throw new Error("支払いが見つかりません。");
      if (paymentDto(payment).allocated_amount > 0) throw new Error("精算済みの金額があります。");
      payment.cancelled_at = new Date().toISOString();
      payment.updated_at = payment.cancelled_at;
      return { payment: paymentDto(payment) };
    }
    case "transfers.create_direct": {
      const batch = createDirect(payload);
      return { transfer_batch: batchDto(batch), idempotent_replay: false, preview: preview() };
    }
    case "transfers.create_optimized": {
      const batch = createOptimized(payload);
      return { transfer_batch: batchDto(batch), idempotent_replay: false, preview: preview() };
    }
    case "transfers.cancel_latest": {
      const active = batches.filter((batch) => batch.status === "ACTIVE")
        .sort((left, right) => new Date(right.transferred_at) - new Date(left.transferred_at));
      if (!active[0] || active[0].transfer_batch_id !== payload.transfer_batch_id) {
        throw new Error("取り消せるのは直前の精算記録だけです。");
      }
      active[0].status = "CANCELLED";
      active[0].cancelled_at = new Date().toISOString();
      return { cancelled_transfer_batch: batchDto(active[0]), preview: preview() };
    }
    case "history.list":
      return history(payload);
    default:
      throw new Error(`Unknown demo action: ${action}`);
  }
}
