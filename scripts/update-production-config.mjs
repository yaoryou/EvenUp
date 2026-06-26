import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [field, value] = process.argv.slice(2);
const allowed = new Set([
  "spreadsheet_id",
  "script_id",
  "deployment_id",
  "web_app_url"
]);

if (!allowed.has(field) || !value) {
  throw new Error("Usage: node scripts/update-production-config.mjs <field> <value>");
}

const path = resolve(".evenup-production.json");
const config = JSON.parse(await readFile(path, "utf8"));
config[field] = value;
await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log(`Updated ${field}`);
