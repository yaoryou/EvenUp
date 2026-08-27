import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateImportSql, validateSnapshot } from "../../scripts/supabase-migration.mjs";

const ids = {
  m1: "11111111-1111-4111-8111-111111111111",
  m2: "22222222-2222-4222-8222-222222222222",
  p1: "33333333-3333-4333-8333-333333333333",
  pr1: "44444444-4444-4444-8444-444444444444",
  b1: "55555555-5555-4555-8555-555555555555",
  br1: "66666666-6666-4666-8666-666666666666",
  t1: "77777777-7777-4777-8777-777777777777",
  a1: "88888888-8888-4888-8888-888888888888"
};

function fixture() {
  const at = "2026-08-27T12:00:00.000+09:00";
  const payload = {
    format: "evenup-sheet-snapshot",
    version: 1,
    exported_at: at,
    time_zone: "Asia/Tokyo",
    sheets: {
      members: [
        { member_id: ids.m1, name: "兄", active: true, sort_order: 10, created_at: at, updated_at: at },
        { member_id: ids.m2, name: "妹", active: true, sort_order: 20, created_at: at, updated_at: at }
      ],
      payments: [
        { payment_id: ids.p1, request_id: ids.pr1, paid_at: at, description: "食事", paid_by: ids.m1, amount: 100, cancelled_at: "", created_at: at, updated_at: at }
      ],
      payment_shares: [
        { payment_id: ids.p1, member_id: ids.m1, share_amount: 50, created_at: at, updated_at: at },
        { payment_id: ids.p1, member_id: ids.m2, share_amount: 50, created_at: at, updated_at: at }
      ],
      transfer_batches: [
        { transfer_batch_id: ids.b1, request_id: ids.br1, mode: "DIRECT", transferred_at: at, status: "ACTIVE", cancelled_at: "", created_at: at, updated_at: at }
      ],
      transfers: [
        { transfer_id: ids.t1, transfer_batch_id: ids.b1, from_member_id: ids.m2, to_member_id: ids.m1, amount: 50, sort_order: 1, created_at: at }
      ],
      transfer_allocations: [
        { allocation_id: ids.a1, transfer_batch_id: ids.b1, payment_id: ids.p1, member_id: ids.m2, allocated_amount: 50, sort_order: 1, created_at: at }
      ]
    }
  };
  return {
    ...payload,
    checksum_sha256: createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex"),
    row_counts: Object.fromEntries(Object.entries(payload.sheets).map(([name, rows]) => [name, rows.length]))
  };
}

test("validates a complete migration snapshot", () => {
  const result = validateSnapshot(fixture());
  assert.equal(result.counts.payments, 1);
  assert.equal(result.counts.transfer_allocations, 1);
});

test("rejects a modified snapshot by checksum", () => {
  const snapshot = fixture();
  snapshot.sheets.payments[0].amount = 101;
  assert.throws(() => validateSnapshot(snapshot), /checksum/);
});

test("rejects a payment whose shares do not reconcile", () => {
  const snapshot = fixture();
  snapshot.sheets.payment_shares[1].share_amount = 49;
  const payload = {
    format: snapshot.format,
    version: snapshot.version,
    exported_at: snapshot.exported_at,
    time_zone: snapshot.time_zone,
    sheets: snapshot.sheets
  };
  snapshot.checksum_sha256 = createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
  assert.throws(() => validateSnapshot(snapshot), /shares total/);
});

test("generates a guarded one-transaction SQL import", () => {
  const sql = generateImportSql(fixture(), "nko");
  assert.match(sql, /^-- Generated[\s\S]*begin;/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /Expected exactly one active ADMIN/);
  assert.match(sql, /Import refused: nko already has business data/);
  assert.match(sql, /MIGRATION_IMPORT/);
  assert.match(sql, /commit;/);
});
