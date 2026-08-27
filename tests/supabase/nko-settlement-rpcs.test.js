import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/202608270005_nko_settlement_rpcs.sql";
const verificationPath = "supabase/verification/202608270005_nko_settlement_rpcs_check.sql";

test("settlement debt helpers ignore cancelled payments and batches", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /payment\.cancelled_at is null/);
  assert.match(sql, /transfer_batch\.status = 'ACTIVE'/);
  assert.match(sql, /share\.member_id <> payment\.paid_by/);
});

test("settlement tokens use SHA-256 base64url material", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /pg_catalog\.sha256/);
  assert.match(sql, /pg_catalog\.encode/);
  assert.match(sql, /pg_catalog\.translate/);
  assert.match(sql, /pg_catalog\.rtrim/);
});

test("settlement RPCs use the shared ledger lock and authenticated execution only", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const functionName of [
    "evenup_transfers_create_direct",
    "evenup_transfers_create_optimized",
    "evenup_transfers_cancel_latest"
  ]) {
    const start = sql.indexOf(`create or replace function public.${functionName}`);
    const end = sql.indexOf("$$;", start);
    const definition = sql.slice(start, end);
    assert.match(definition, /security definer/);
    assert.match(definition, /set search_path = ''/);
    assert.match(definition, /private\.lock_evenup_ledger\(p_group_id\)/);
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${functionName}\\([\\s\\S]*?from public, anon, authenticated, service_role;`)
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${functionName}\\([\\s\\S]*?to authenticated;`)
    );
  }
});

test("direct settlements validate the route and preserve FIFO allocation", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /DIRECT_ROUTE_CONFLICT/);
  assert.match(sql, /order by debt\.paid_at, debt\.payment_id::text/g);
  assert.match(sql, /v_route\.offset_amount \* 2 \+ p_amount/);
});

test("optimized settlements validate snapshots and allocate every open debt", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /SNAPSHOT_CONFLICT/);
  assert.match(sql, /NO_OPEN_DEBTS/);
  assert.match(sql, /from private\.evenup_optimized_routes\(p_group_id\)/);
  assert.match(sql, /v_allocation_total <> v_open_debt_total/);
});

test("settlement cancellation is limited to the latest manageable batch", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /private\.can_manage_record\(p_group_id, v_batch\.created_by_user_id\)/);
  assert.match(sql, /TRANSFER_BATCH_NOT_LATEST/);
  assert.match(sql, /order by transfer_batch\.transferred_at desc, transfer_batch\.transfer_batch_id desc/);
});

test("all settlement changes are idempotent and audited", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /'TRANSFER_CREATE_DIRECT'/);
  assert.match(sql, /'TRANSFER_CREATE_OPTIMIZED'/);
  assert.match(sql, /'TRANSFER_CANCEL'/);
  assert.match(sql, /'idempotent_replay', true/g);
});

test("settlement verification checks private and public execution boundaries", async () => {
  const sql = await readFile(verificationPath, "utf8");
  assert.match(sql, /private\.lock_evenup_ledger\(text\)/);
  assert.match(sql, /private\.evenup_payments_create_unlocked/);
  assert.match(sql, /public\.evenup_transfers_create_direct/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
  assert.match(sql, /has_function_privilege\('anon'/);
});
