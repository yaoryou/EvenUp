import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/202608270004_nko_ledger_lock.sql";

test("payment RPC wrappers acquire one group ledger lock", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /hashtextextended\(target_group_id \|\| ':EVENUP_LEDGER'/);

  for (const functionName of [
    "evenup_payments_create",
    "evenup_payments_update",
    "evenup_payments_cancel"
  ]) {
    const start = sql.indexOf(`create or replace function public.${functionName}`);
    const end = sql.indexOf("$$;", start);
    const definition = sql.slice(start, end);
    assert.match(definition, /security definer/);
    assert.match(definition, /set search_path = ''/);
    assert.match(definition, /private\.lock_evenup_ledger\(p_group_id\)/);
  }
});

test("unlocked payment implementations are moved to private and not executable by clients", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const functionName of [
    "evenup_payments_create_unlocked",
    "evenup_payments_update_unlocked",
    "evenup_payments_cancel_unlocked"
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function private\\.${functionName}\\([\\s\\S]*?from public, anon, authenticated, service_role;`)
    );
  }
});

test("public payment RPC signatures and authenticated grants stay unchanged", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const functionName of [
    "evenup_payments_create",
    "evenup_payments_update",
    "evenup_payments_cancel"
  ]) {
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${functionName}\\([\\s\\S]*?to authenticated;`)
    );
  }
});
