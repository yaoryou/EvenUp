import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/202608270003_nko_payment_rpcs.sql";
const verificationPath = "supabase/verification/202608270003_nko_payment_rpcs_check.sql";

test("payment RPCs are security-definer functions with pinned search paths", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const functionName of [
    "evenup_payments_create",
    "evenup_payments_update",
    "evenup_payments_cancel"
  ]) {
    const start = sql.indexOf(`create or replace function public.${functionName}`);
    assert.notEqual(start, -1, `${functionName} must exist`);
    const end = sql.indexOf("$$;", start);
    const definition = sql.slice(start, end);
    assert.match(definition, /security definer/);
    assert.match(definition, /set search_path = ''/);
    assert.match(definition, /auth\.uid\(\)/);
    assert.match(definition, /private\.is_active_group_member\(p_group_id\)/);
  }
});

test("payment RPC execution is restricted to authenticated users", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const functionName of [
    "evenup_payments_create",
    "evenup_payments_update",
    "evenup_payments_cancel"
  ]) {
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

test("all payment writes are idempotent and audited", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /evenup_audit_events_request_idempotency_idx/);
  assert.match(sql, /pg_advisory_xact_lock/g);
  assert.match(sql, /'PAYMENT_CREATE'/);
  assert.match(sql, /'PAYMENT_UPDATE'/);
  assert.match(sql, /'PAYMENT_CANCEL'/);
  assert.match(sql, /'idempotent_replay', true/g);
});

test("editing and cancelling enforce record ownership, optimistic locking, and allocations", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /private\.can_manage_record\(p_group_id, v_payment\.created_by_user_id\)/g);
  assert.match(sql, /v_payment\.updated_at <> p_expected_updated_at/g);
  assert.match(sql, /transfer_batch\.status = 'ACTIVE'/g);
  assert.match(sql, /PAYMENT_HAS_ALLOCATIONS/g);
});

test("share replacement preserves cancelled transfer history", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /drop constraint evenup_transfer_allocations_share_fk/);
  assert.match(sql, /evenup_transfer_allocations_payment_fk/);
  assert.match(sql, /evenup_transfer_allocations_member_fk/);
  assert.match(sql, /delete from public\.evenup_payment_shares/);
});

test("share rounding assigns remainder away from the payer first", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /order by \(target\.member_id = v_paid_by\), target\.member_id/g);
  assert.match(sql, /p_amount % v_target_count/g);
});

test("payment RPC verification checks functions, grants, idempotency, and constraints", async () => {
  const sql = await readFile(verificationPath, "utf8");
  assert.match(sql, /to_regprocedure/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.match(sql, /evenup_audit_events_request_idempotency_idx/);
  assert.match(sql, /evenup_transfer_allocations_payment_fk/);
  assert.match(sql, /evenup_transfer_allocations_member_fk/);
  assert.match(sql, /evenup_transfer_allocations_share_fk/);
});
