import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/202608280001_fate_group.sql";
const verificationPath = "supabase/verification/202608280001_fate_group_check.sql";
const adminTemplatePath = "supabase/templates/provision-fate-admin-from-nko.sql";

const expectedMembers = [
  ["8d204af2-586f-4bfd-9799-378e13f2165f", "ナカチ", 10],
  ["54283175-5698-4573-b0dc-168e64a1fa9b", "シャ卿", 20],
  ["bb5a6aae-9717-4274-8a0e-93859e34ab3f", "チンピラ", 30]
];

test("チンパン migration creates an active isolated group", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /'fate',\s*'チンパン',\s*true/);
  assert.match(sql, /on conflict \(group_id\) do update/i);
});

test("チンパン migration preserves existing member ids and ordering", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const [memberId, name, sortOrder] of expectedMembers) {
    assert.match(sql, new RegExp(`'fate', '${memberId}', '${name}', true, ${sortOrder}`));
  }
  assert.match(sql, /on conflict \(group_id, member_id\) do update/i);
});

test("チンパン verification requires an empty business ledger before import", async () => {
  const sql = await readFile(verificationPath, "utf8");
  assert.match(sql, /group_id = 'fate'/g);
  assert.match(sql, /evenup_payments/);
  assert.match(sql, /evenup_transfer_batches/);
  assert.match(sql, /business_count <> 0/);
});

test("チンパン admin provisioning reuses exactly one NKO administrator", async () => {
  const sql = await readFile(adminTemplatePath, "utf8");
  assert.match(sql, /source_admin_count <> 1/);
  assert.match(sql, /group_id = 'nko'/);
  assert.match(sql, /'fate'/);
  assert.match(sql, /'<MEMBER_ID>'/);
  assert.doesNotMatch(sql, /@/);
});
