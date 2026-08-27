import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/202608270001_nko_foundation.sql";
const memberMigrationPath = "supabase/migrations/202608270002_nko_members.sql";
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

test("NKO member migration preserves the existing member ids and ordering", async () => {
  const sql = await readFile(memberMigrationPath, "utf8");
  const expectedMembers = [
    ["c124f6f2-7ff8-4386-88df-f5dbd3007432", "兄", 10],
    ["cb2972b8-6ca7-450a-910a-4c6261abc528", "妹", 20],
    ["b0b41c09-be15-419f-a862-e43176638198", "母", 30],
    ["4e4d754c-6a89-441e-af5c-9b56a3966f46", "父", 40]
  ];

  for (const [memberId, name, sortOrder] of expectedMembers) {
    assert.match(sql, new RegExp(`'${memberId}', '${name}', true, ${sortOrder}`));
  }

  assert.match(sql, /on conflict \(group_id, member_id\) do update/i);
});
