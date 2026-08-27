import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/202608270006_nko_read_rpcs.sql", "utf8");
const verification = readFileSync("supabase/verification/202608270006_nko_read_rpcs_check.sql", "utf8");

test("read RPCs require an active authenticated group member", () => {
  for (const name of ["evenup_bootstrap", "evenup_settlement_preview", "evenup_history_list"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
  }
  assert.ok((migration.match(/not private\.is_active_group_member\(p_group_id\)/g) || []).length >= 3);
});

test("preview contains the complete existing frontend contract", () => {
  for (const key of [
    "current_user", "members", "open_payments", "balances", "direct_routes",
    "optimized_routes", "optimized_snapshot_token", "latest_cancellable_transfer_batch"
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.match(migration, /private\.can_manage_record\(target_group_id, transfer_batch\.created_by_user_id\)/);
});

test("history is bounded and exposes opaque pagination fields", () => {
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 20\), 1\), 20\)/);
  assert.match(migration, /'next_cursor'/);
  assert.match(migration, /'has_more'/);
});

test("read helpers remain private and public RPCs are authenticated only", () => {
  assert.match(migration, /revoke all on function private\.evenup_preview_json\(text\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.evenup_bootstrap\(text\) to authenticated/);
  assert.match(verification, /anon must not execute/);
  assert.match(verification, /authenticated must not execute private preview helper/);
});
