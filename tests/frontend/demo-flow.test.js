import test from "node:test";
import assert from "node:assert/strict";
import { callDemoApi } from "../../frontend/js/api/demo.js";

test("demo supports partial settlement, cancellation, edit, and payment cancellation", async () => {
  const initial = await callDemoApi("bootstrap");
  const route = initial.direct_routes.find((item) => item.from_member_id === "M002");
  assert.ok(route);

  const settled = await callDemoApi("transfers.create_direct", {
    route_key: route.route_key,
    from_member_id: route.from_member_id,
    to_member_id: route.to_member_id,
    amount: 100
  });
  assert.equal(settled.preview.open_payments[0].status, "PARTIALLY_SETTLED");
  assert.equal(settled.preview.open_payments[0].remaining_amount, 567);

  const transferHistory = await callDemoApi("history.list", {
    type: "TRANSFER",
    cursor: null,
    limit: 20
  });
  assert.equal(transferHistory.items.length, 1);

  const restored = await callDemoApi("transfers.cancel_latest", {
    transfer_batch_id: settled.transfer_batch.transfer_batch_id
  });
  assert.equal(restored.preview.open_payments[0].status, "UNSETTLED");
  assert.equal(restored.preview.open_payments[0].remaining_amount, 667);

  const payment = restored.preview.open_payments[0];
  await callDemoApi("payments.update", {
    payment_id: payment.payment_id,
    expected_updated_at: payment.updated_at,
    description: "ラーメン・餃子",
    amount: 1200,
    paid_by: "M001",
    target_member_ids: ["M001", "M002", "M003"]
  });
  const updated = await callDemoApi("settlement.preview");
  assert.equal(updated.open_payments[0].description, "ラーメン・餃子");
  assert.equal(updated.open_payments[0].amount, 1200);

  await callDemoApi("payments.cancel", {
    payment_id: updated.open_payments[0].payment_id,
    expected_updated_at: updated.open_payments[0].updated_at
  });
  const finished = await callDemoApi("settlement.preview");
  assert.equal(finished.open_payments.length, 0);
});
