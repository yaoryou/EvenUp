import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/202608270001_nko_foundation.sql";
const verificationPath = "supabase/verification/202608270001_nko_foundation_check.sql";

const tableNames = [
  "evenup_groups",
  "evenup_members",
  "evenup_group_memberships",
  "evenup_payments",
  "evenup_payment_shares",
  "evenup_transfer_batches",
  "evenup_transfers",
  "evenup_transfer_allocations",
  "evenup_audit_events"
];

test("NKO foundation enables RLS and revokes anonymous access for every table", async () => {
  const sql = await readFile(migrationPath, "utf8");

  for (const tableName of tableNames) {
    assert.match(sql, new RegExp(`alter table public\\.${tableName} enable row level security;`));
    assert.match(
      sql,
      new RegExp(`revoke all on table public\\.${tableName} from public, anon, authenticated, service_role;`)
    );
  }
});

test("authenticated browser clients receive read-only table grants", async () => {
  const sql = await readFile(migrationPath, "utf8");

  for (const tableName of tableNames) {
    assert.match(sql, new RegExp(`grant select on table public\\.${tableName} to authenticated;`));
    assert.doesNotMatch(
      sql,
      new RegExp(`grant (?:insert|update|delete|all)[^;]*public\\.${tableName}[^;]*authenticated`, "i")
    );
  }
});

test("authorization helpers are private security-definer functions with pinned search paths", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const helperNames = [
    "is_active_group_member",
    "is_group_admin",
    "can_manage_record",
    "current_member_id"
  ];

  for (const helperName of helperNames) {
    const start = sql.indexOf(`create or replace function private.${helperName}`);
    assert.notEqual(start, -1, `${helperName} must exist`);
    const end = sql.indexOf("$$;", start);
    const definition = sql.slice(start, end);
    assert.match(definition, /security definer/);
    assert.match(definition, /set search_path = ''/);
  }
});

test("foundation verification checks RLS, anonymous grants, and authenticated writes", async () => {
  const sql = await readFile(verificationPath, "utf8");
  assert.match(sql, /relrowsecurity/);
  assert.match(sql, /grantee = 'anon'/);
  assert.match(sql, /grantee = 'authenticated'/);
  assert.match(sql, /privilege_type <> 'SELECT'/);
});
