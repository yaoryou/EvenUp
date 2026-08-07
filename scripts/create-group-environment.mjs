import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  groupIdFromArgs,
  loadEnvironment,
  loadGroups,
  selectGroup
} from "./group-config.mjs";

const groups = await loadGroups();
const group = selectGroup(groups, groupIdFromArgs(process.argv.slice(2)));
const { environment, path: environmentPath } = await loadEnvironment(group);

if (group.enabled) {
  throw new Error(`${group.id}: disable a group while creating its Google environment.`);
}
if (environment.script_id || environment.spreadsheet_id) {
  throw new Error(`${group.id}: Google environment identifiers already exist; creation was stopped.`);
}

const directory = await mkdtemp(join(tmpdir(), `evenup-create-${group.id}-`));
const clasp = resolve("node_modules/.bin/clasp");

try {
  const result = spawnSync(clasp, [
    "--json",
    "create",
    "--type",
    "sheets",
    "--title",
    `EvenUp ${group.name}`,
    "--rootDir",
    directory
  ], {
    cwd: directory,
    encoding: "utf8"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`clasp create failed: ${result.stderr || result.stdout}`);
  }

  const output = JSON.parse(result.stdout);
  if (!output.scriptId || !output.parentId) {
    throw new Error("clasp create did not return both scriptId and spreadsheetId.");
  }

  const updated = {
    ...environment,
    script_id: output.scriptId,
    spreadsheet_id: output.parentId
  };
  await writeFile(environmentPath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });

  console.log(`Created ${group.id} Google environment.`);
  console.log(`Spreadsheet: https://docs.google.com/spreadsheets/d/${output.parentId}/edit`);
  console.log(`Apps Script: https://script.google.com/d/${output.scriptId}/edit`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
