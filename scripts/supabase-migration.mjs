import { createHash } from "node:crypto";

export const SNAPSHOT_FORMAT = "evenup-sheet-snapshot";
export const SNAPSHOT_VERSION = 1;

export const SHEET_HEADERS = Object.freeze({
  members: ["member_id", "name", "active", "sort_order", "created_at", "updated_at"],
  payments: ["payment_id", "request_id", "paid_at", "description", "paid_by", "amount", "cancelled_at", "created_at", "updated_at"],
  payment_shares: ["payment_id", "member_id", "share_amount", "created_at", "updated_at"],
  transfer_batches: ["transfer_batch_id", "request_id", "mode", "transferred_at", "status", "cancelled_at", "created_at", "updated_at"],
  transfers: ["transfer_id", "transfer_batch_id", "from_member_id", "to_member_id", "amount", "sort_order", "created_at"],
  transfer_allocations: ["allocation_id", "transfer_batch_id", "payment_id", "member_id", "allocated_amount", "sort_order", "created_at"]
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

function fail(message) {
  throw new Error(`Snapshot validation failed: ${message}`);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
}

function requireString(value, label, { min = 1, max = Infinity } = {}) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    fail(`${label} must be a string of ${min}-${max === Infinity ? "∞" : max} characters`);
  }
  return value;
}

function requireUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail(`${label} must be a UUID`);
  return value;
}

function requireInteger(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function requireDate(value, label, nullable = false) {
  if ((value === "" || value === null) && nullable) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(`${label} must be an ISO date`);
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}

function unique(rows, key, label) {
  const seen = new Set();
  for (const row of rows) {
    const value = typeof key === "function" ? key(row) : row[key];
    if (seen.has(value)) fail(`${label} contains duplicate ${value}`);
    seen.add(value);
  }
}

function validateEnvelope(snapshot) {
  requireObject(snapshot, "snapshot");
  if (snapshot.format !== SNAPSHOT_FORMAT) fail(`unsupported format ${snapshot.format}`);
  if (snapshot.version !== SNAPSHOT_VERSION) fail(`unsupported version ${snapshot.version}`);
  requireDate(snapshot.exported_at, "exported_at");
  if (snapshot.time_zone !== "Asia/Tokyo") fail("time_zone must be Asia/Tokyo");
  requireObject(snapshot.sheets, "sheets");

  for (const [sheetName, headers] of Object.entries(SHEET_HEADERS)) {
    const rows = snapshot.sheets[sheetName];
    if (!Array.isArray(rows)) fail(`${sheetName} must be an array`);
    rows.forEach((row, index) => {
      requireObject(row, `${sheetName}[${index}]`);
      const actual = Object.keys(row);
      if (actual.length !== headers.length || headers.some((header) => !actual.includes(header))) {
        fail(`${sheetName}[${index}] columns do not match the schema`);
      }
    });
  }

  const payload = {
    format: snapshot.format,
    version: snapshot.version,
    exported_at: snapshot.exported_at,
    time_zone: snapshot.time_zone,
    sheets: snapshot.sheets
  };
  const checksum = createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
  if (snapshot.checksum_sha256 !== checksum) fail("checksum does not match the exported data");
  return checksum;
}

export function validateSnapshot(snapshot) {
  const checksum = validateEnvelope(snapshot);
  const { members, payments, payment_shares: shares, transfer_batches: batches, transfers, transfer_allocations: allocations } = snapshot.sheets;

  members.forEach((row, index) => {
    requireUuid(row.member_id, `members[${index}].member_id`);
    requireString(row.name, `members[${index}].name`, { max: 50 });
    requireBoolean(row.active, `members[${index}].active`);
    requireInteger(row.sort_order, `members[${index}].sort_order`, 0);
    requireDate(row.created_at, `members[${index}].created_at`);
    requireDate(row.updated_at, `members[${index}].updated_at`);
  });
  unique(members, "member_id", "members");
  const memberIds = new Set(members.map((row) => row.member_id));

  payments.forEach((row, index) => {
    requireUuid(row.payment_id, `payments[${index}].payment_id`);
    requireUuid(row.request_id, `payments[${index}].request_id`);
    requireDate(row.paid_at, `payments[${index}].paid_at`);
    requireString(row.description, `payments[${index}].description`, { max: 100 });
    if (!memberIds.has(row.paid_by)) fail(`payments[${index}].paid_by does not reference a member`);
    requireInteger(row.amount, `payments[${index}].amount`, 1, 99999999);
    requireDate(row.cancelled_at, `payments[${index}].cancelled_at`, true);
    requireDate(row.created_at, `payments[${index}].created_at`);
    requireDate(row.updated_at, `payments[${index}].updated_at`);
  });
  unique(payments, "payment_id", "payments");
  unique(payments, "request_id", "payments request_id");
  const paymentsById = new Map(payments.map((row) => [row.payment_id, row]));

  shares.forEach((row, index) => {
    if (!paymentsById.has(row.payment_id)) fail(`payment_shares[${index}] references an unknown payment`);
    if (!memberIds.has(row.member_id)) fail(`payment_shares[${index}] references an unknown member`);
    requireInteger(row.share_amount, `payment_shares[${index}].share_amount`, 0);
    requireDate(row.created_at, `payment_shares[${index}].created_at`);
    requireDate(row.updated_at, `payment_shares[${index}].updated_at`);
  });
  unique(shares, (row) => `${row.payment_id}:${row.member_id}`, "payment_shares");
  for (const payment of payments) {
    const paymentShares = shares.filter((row) => row.payment_id === payment.payment_id);
    if (!paymentShares.length) fail(`payment ${payment.payment_id} has no shares`);
    const total = paymentShares.reduce((sum, row) => sum + row.share_amount, 0);
    if (total !== payment.amount) fail(`payment ${payment.payment_id} shares total ${total}, expected ${payment.amount}`);
  }

  batches.forEach((row, index) => {
    requireUuid(row.transfer_batch_id, `transfer_batches[${index}].transfer_batch_id`);
    requireUuid(row.request_id, `transfer_batches[${index}].request_id`);
    if (!["DIRECT", "OPTIMIZED"].includes(row.mode)) fail(`transfer_batches[${index}].mode is invalid`);
    if (!["ACTIVE", "CANCELLED"].includes(row.status)) fail(`transfer_batches[${index}].status is invalid`);
    requireDate(row.transferred_at, `transfer_batches[${index}].transferred_at`);
    const cancelledAt = requireDate(row.cancelled_at, `transfer_batches[${index}].cancelled_at`, true);
    if ((row.status === "ACTIVE") !== (cancelledAt === null)) fail(`transfer_batches[${index}] cancellation fields are inconsistent`);
    requireDate(row.created_at, `transfer_batches[${index}].created_at`);
    requireDate(row.updated_at, `transfer_batches[${index}].updated_at`);
  });
  unique(batches, "transfer_batch_id", "transfer_batches");
  unique(batches, "request_id", "transfer_batches request_id");
  const batchesById = new Map(batches.map((row) => [row.transfer_batch_id, row]));

  transfers.forEach((row, index) => {
    requireUuid(row.transfer_id, `transfers[${index}].transfer_id`);
    if (!batchesById.has(row.transfer_batch_id)) fail(`transfers[${index}] references an unknown batch`);
    if (!memberIds.has(row.from_member_id) || !memberIds.has(row.to_member_id) || row.from_member_id === row.to_member_id) {
      fail(`transfers[${index}] has invalid members`);
    }
    requireInteger(row.amount, `transfers[${index}].amount`, 0);
    requireInteger(row.sort_order, `transfers[${index}].sort_order`, 1);
    requireDate(row.created_at, `transfers[${index}].created_at`);
  });
  unique(transfers, "transfer_id", "transfers");
  unique(transfers, (row) => `${row.transfer_batch_id}:${row.sort_order}`, "transfers sort_order");
  for (const batch of batches.filter((row) => row.mode === "DIRECT")) {
    if (transfers.filter((row) => row.transfer_batch_id === batch.transfer_batch_id).length !== 1) {
      fail(`DIRECT batch ${batch.transfer_batch_id} must have exactly one transfer`);
    }
  }

  allocations.forEach((row, index) => {
    requireUuid(row.allocation_id, `transfer_allocations[${index}].allocation_id`);
    if (!batchesById.has(row.transfer_batch_id)) fail(`transfer_allocations[${index}] references an unknown batch`);
    const payment = paymentsById.get(row.payment_id);
    if (!payment) fail(`transfer_allocations[${index}] references an unknown payment`);
    const share = shares.find((item) => item.payment_id === row.payment_id && item.member_id === row.member_id);
    if (!share || row.member_id === payment.paid_by) fail(`transfer_allocations[${index}] references an invalid debt`);
    requireInteger(row.allocated_amount, `transfer_allocations[${index}].allocated_amount`, 1);
    requireInteger(row.sort_order, `transfer_allocations[${index}].sort_order`, 1);
    requireDate(row.created_at, `transfer_allocations[${index}].created_at`);
  });
  unique(allocations, "allocation_id", "transfer_allocations");
  unique(allocations, (row) => `${row.transfer_batch_id}:${row.payment_id}:${row.member_id}`, "transfer_allocations debt");
  unique(allocations, (row) => `${row.transfer_batch_id}:${row.sort_order}`, "transfer_allocations sort_order");

  for (const share of shares) {
    const payment = paymentsById.get(share.payment_id);
    const activeAllocated = allocations
      .filter((row) => row.payment_id === share.payment_id && row.member_id === share.member_id && batchesById.get(row.transfer_batch_id).status === "ACTIVE")
      .reduce((sum, row) => sum + row.allocated_amount, 0);
    if (activeAllocated > share.share_amount) fail(`active allocations exceed share ${share.payment_id}:${share.member_id}`);
    if (payment.cancelled_at && activeAllocated > 0) fail(`cancelled payment ${payment.payment_id} has active allocations`);
  }

  const counts = Object.fromEntries(Object.entries(snapshot.sheets).map(([name, rows]) => [name, rows.length]));
  return { checksum, counts };
}

function encodedRows(rows) {
  return Buffer.from(JSON.stringify(rows), "utf8").toString("base64");
}

function recordset(rows, columns) {
  return `jsonb_to_recordset(convert_from(decode('${encodedRows(rows)}', 'base64'), 'utf8')::jsonb) as r(${columns})`;
}

export function generateImportSql(snapshot, groupId) {
  if (!GROUP_PATTERN.test(groupId)) throw new Error(`Invalid group id: ${groupId}`);
  const { checksum, counts } = validateSnapshot(snapshot);
  const s = snapshot.sheets;
  const countsJson = JSON.stringify(counts);

  return `-- Generated from a validated EvenUp snapshot. Do not commit this data file.\n` +
`begin;\n\n` +
`select pg_advisory_xact_lock(hashtextextended('evenup:ledger:${groupId}', 0));\n\n` +
`create temporary table evenup_import_context (\n  group_id text not null,\n  actor_user_id uuid not null,\n  source_checksum text not null\n) on commit drop;\n\n` +
`do $$\n` +
`declare\n  v_group_exists boolean;\n  v_admin_count integer;\n  v_business_count bigint;\n` +
`begin\n` +
`  select exists(select 1 from public.evenup_groups where group_id = '${groupId}' and active) into v_group_exists;\n` +
`  if not v_group_exists then raise exception 'Active group ${groupId} was not found'; end if;\n` +
`  select count(*) into v_admin_count from public.evenup_group_memberships where group_id = '${groupId}' and active and role = 'ADMIN';\n` +
`  if v_admin_count <> 1 then raise exception 'Expected exactly one active ADMIN for ${groupId}, found %', v_admin_count; end if;\n` +
`  select (select count(*) from public.evenup_payments where group_id = '${groupId}')\n` +
`       + (select count(*) from public.evenup_transfer_batches where group_id = '${groupId}') into v_business_count;\n` +
`  if v_business_count <> 0 then raise exception 'Import refused: ${groupId} already has business data'; end if;\n` +
`end;\n$$;\n\n` +
`insert into evenup_import_context (group_id, actor_user_id, source_checksum)\n` +
`select '${groupId}', user_id, '${checksum}' from public.evenup_group_memberships where group_id = '${groupId}' and active and role = 'ADMIN';\n\n` +
`insert into public.evenup_members (group_id, member_id, name, active, sort_order, created_at, updated_at)\n` +
`select '${groupId}', r.member_id, r.name, r.active, r.sort_order, r.created_at::timestamptz, r.updated_at::timestamptz\nfrom ${recordset(s.members, "member_id text, name text, active boolean, sort_order integer, created_at text, updated_at text")}\n` +
`on conflict (group_id, member_id) do update set name = excluded.name, active = excluded.active, sort_order = excluded.sort_order, created_at = excluded.created_at, updated_at = excluded.updated_at;\n\n` +
`insert into public.evenup_payments (payment_id, group_id, request_id, paid_at, description, paid_by, amount, created_by_user_id, updated_by_user_id, cancelled_at, cancelled_by_user_id, created_at, updated_at)\n` +
`select r.payment_id::uuid, c.group_id, r.request_id::uuid, r.paid_at::timestamptz, r.description, r.paid_by, r.amount, c.actor_user_id, c.actor_user_id, nullif(r.cancelled_at, '')::timestamptz, case when nullif(r.cancelled_at, '') is null then null else c.actor_user_id end, r.created_at::timestamptz, r.updated_at::timestamptz\nfrom ${recordset(s.payments, "payment_id text, request_id text, paid_at text, description text, paid_by text, amount bigint, cancelled_at text, created_at text, updated_at text")} cross join evenup_import_context c;\n\n` +
`insert into public.evenup_payment_shares (group_id, payment_id, member_id, share_amount, created_at, updated_at)\n` +
`select c.group_id, r.payment_id::uuid, r.member_id, r.share_amount, r.created_at::timestamptz, r.updated_at::timestamptz\nfrom ${recordset(s.payment_shares, "payment_id text, member_id text, share_amount bigint, created_at text, updated_at text")} cross join evenup_import_context c;\n\n` +
`insert into public.evenup_transfer_batches (transfer_batch_id, group_id, request_id, mode, transferred_at, status, created_by_user_id, updated_by_user_id, cancelled_at, cancelled_by_user_id, created_at, updated_at)\n` +
`select r.transfer_batch_id::uuid, c.group_id, r.request_id::uuid, r.mode, r.transferred_at::timestamptz, r.status, c.actor_user_id, c.actor_user_id, nullif(r.cancelled_at, '')::timestamptz, case when r.status = 'CANCELLED' then c.actor_user_id else null end, r.created_at::timestamptz, r.updated_at::timestamptz\nfrom ${recordset(s.transfer_batches, "transfer_batch_id text, request_id text, mode text, transferred_at text, status text, cancelled_at text, created_at text, updated_at text")} cross join evenup_import_context c;\n\n` +
`insert into public.evenup_transfers (transfer_id, group_id, transfer_batch_id, from_member_id, to_member_id, amount, sort_order, created_at)\n` +
`select r.transfer_id::uuid, c.group_id, r.transfer_batch_id::uuid, r.from_member_id, r.to_member_id, r.amount, r.sort_order, r.created_at::timestamptz\nfrom ${recordset(s.transfers, "transfer_id text, transfer_batch_id text, from_member_id text, to_member_id text, amount bigint, sort_order integer, created_at text")} cross join evenup_import_context c;\n\n` +
`insert into public.evenup_transfer_allocations (allocation_id, group_id, transfer_batch_id, payment_id, member_id, allocated_amount, sort_order, created_at)\n` +
`select r.allocation_id::uuid, c.group_id, r.transfer_batch_id::uuid, r.payment_id::uuid, r.member_id, r.allocated_amount, r.sort_order, r.created_at::timestamptz\nfrom ${recordset(s.transfer_allocations, "allocation_id text, transfer_batch_id text, payment_id text, member_id text, allocated_amount bigint, sort_order integer, created_at text")} cross join evenup_import_context c;\n\n` +
`insert into public.evenup_audit_events (group_id, actor_user_id, action, entity_type, entity_id, after_data)\n` +
`select group_id, actor_user_id, 'MIGRATION_IMPORT', 'GROUP', group_id, jsonb_build_object('source_checksum', source_checksum, 'source_exported_at', '${snapshot.exported_at}', 'row_counts', '${countsJson}'::jsonb) from evenup_import_context;\n\n` +
`do $$\n` +
`declare\n  v_count bigint;\n  v_invalid bigint;\n` +
`begin\n` +
Object.entries(counts).map(([sheetName, count]) => {
  const table = `evenup_${sheetName}`;
  return `  select count(*) into v_count from public.${table} where group_id = '${groupId}';\n  if v_count <> ${count} then raise exception '${table} count mismatch: expected ${count}, found %', v_count; end if;`;
}).join("\n") + `\n` +
`  select count(*) into v_invalid\n` +
`  from public.evenup_payments p\n` +
`  left join (select group_id, payment_id, sum(share_amount) total from public.evenup_payment_shares group by group_id, payment_id) s using (group_id, payment_id)\n` +
`  where p.group_id = '${groupId}' and coalesce(s.total, -1) <> p.amount;\n` +
`  if v_invalid <> 0 then raise exception 'Payment/share reconciliation failed for % payments', v_invalid; end if;\n` +
`end;\n$$;\n\n` +
`commit;\n\n` +
`select '${checksum}' as source_checksum,\n` +
`  (select count(*) from public.evenup_payments where group_id = '${groupId}') as payment_count,\n` +
`  (select count(*) from public.evenup_transfer_batches where group_id = '${groupId}') as transfer_batch_count,\n` +
`  (select count(*) from public.evenup_audit_events where group_id = '${groupId}' and action = 'MIGRATION_IMPORT' and after_data->>'source_checksum' = '${checksum}') as migration_audit_count;\n`;
}

export function generateDryRunSql(snapshot, groupId) {
  const importSql = generateImportSql(snapshot, groupId);
  const commitMarker = "\ncommit;\n\n";
  const markerIndex = importSql.lastIndexOf(commitMarker);
  if (markerIndex < 0) throw new Error("Generated import SQL does not contain the expected commit marker");
  const body = importSql.slice(0, markerIndex);
  const verification = importSql.slice(markerIndex + commitMarker.length);
  return `${body}\n\n-- These counts are observed inside the transaction.\n${verification}\n` +
    `rollback;\n\n` +
    `-- A successful dry run leaves the original database unchanged.\n` +
    `select\n` +
    `  (select count(*) from public.evenup_payments where group_id = '${groupId}') as payment_count_after_rollback,\n` +
    `  (select count(*) from public.evenup_transfer_batches where group_id = '${groupId}') as transfer_batch_count_after_rollback,\n` +
    `  (select count(*) from public.evenup_audit_events where group_id = '${groupId}' and action = 'MIGRATION_IMPORT') as migration_audit_count_after_rollback;\n`;
}
