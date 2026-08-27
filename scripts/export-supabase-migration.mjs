import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { groupIdFromArgs, loadEnvironment, loadGroups, selectGroup } from "./group-config.mjs";
import { generateDryRunSql, generateImportSql, validateSnapshot } from "./supabase-migration.mjs";

const args = process.argv.slice(2);
const groupId = groupIdFromArgs(args);
if (!groupId) throw new Error("Usage: node scripts/export-supabase-migration.mjs --group <id>");

const groups = await loadGroups();
const group = selectGroup(groups, groupId);
const { environment } = await loadEnvironment(group);
if (!environment.web_app_url || !environment.access_key) {
  throw new Error(`${groupId}: web_app_url and access_key are required`);
}

const response = await fetch(environment.web_app_url, {
  method: "POST",
  redirect: "follow",
  headers: { "Content-Type": "text/plain;charset=UTF-8" },
  body: JSON.stringify({
    api_version: "v1",
    action: "migration.export_snapshot",
    access_key: environment.access_key,
    request_id: null,
    payload: {}
  })
});
if (!response.ok) throw new Error(`GAS export failed with HTTP ${response.status}`);
const result = await response.json();
if (!result.ok) throw new Error(`GAS export failed: ${result.error?.code || "UNKNOWN"} ${result.error?.message || ""}`);

const snapshot = result.data;
const summary = validateSnapshot(snapshot);
const sql = generateImportSql(snapshot, groupId);
const dryRunSql = generateDryRunSql(snapshot, groupId);
const stamp = snapshot.exported_at.replace(/[^0-9]/g, "").slice(0, 14);
const directory = resolve(".evenup-migration", groupId);
await mkdir(directory, { recursive: true, mode: 0o700 });
const snapshotPath = join(directory, `snapshot-${stamp}.json`);
const sqlPath = join(directory, `import-${stamp}.sql`);
const dryRunSqlPath = join(directory, `dry-run-${stamp}.sql`);
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
await writeFile(sqlPath, sql, { mode: 0o600 });
await writeFile(dryRunSqlPath, dryRunSql, { mode: 0o600 });

console.log(JSON.stringify({
  group_id: groupId,
  exported_at: snapshot.exported_at,
  checksum_sha256: summary.checksum,
  row_counts: summary.counts,
  snapshot_path: snapshotPath,
  import_sql_path: sqlPath,
  dry_run_sql_path: dryRunSqlPath
}, null, 2));
