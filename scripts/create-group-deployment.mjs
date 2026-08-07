import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  groupIdFromArgs,
  loadEnvironment,
  loadGroups,
  selectGroup,
  validateEnvironment
} from "./group-config.mjs";

const groups = await loadGroups();
const group = selectGroup(groups, groupIdFromArgs(process.argv.slice(2)));
const { environment, path: environmentPath } = await loadEnvironment(group);

if (group.enabled) {
  throw new Error(`${group.id}: disable a group while creating its first deployment.`);
}
validateEnvironment(group, environment, ["script_id", "spreadsheet_id"]);
if (environment.deployment_id || environment.web_app_url) {
  throw new Error(`${group.id}: deployment identifiers already exist; creation was stopped.`);
}

const directory = await mkdtemp(join(tmpdir(), `evenup-deploy-${group.id}-`));
const projectPath = join(directory, ".clasp.json");
const clasp = resolve("node_modules/.bin/clasp");

try {
  await writeFile(projectPath, `${JSON.stringify({
    scriptId: environment.script_id,
    rootDir: resolve("gas")
  }, null, 2)}\n`, { mode: 0o600 });

  const result = spawnSync(clasp, [
    "--json",
    "--project",
    projectPath,
    "--ignore",
    resolve("gas/.claspignore"),
    "deploy",
    "--description",
    `EvenUp ${group.name} initial`
  ], {
    cwd: resolve("."),
    encoding: "utf8"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`clasp deploy failed: ${result.stderr || result.stdout}`);
  }

  const output = JSON.parse(result.stdout);
  if (!output.deploymentId) {
    throw new Error("clasp deploy did not return a deploymentId.");
  }

  const webAppUrl = `https://script.google.com/macros/s/${output.deploymentId}/exec`;
  const updated = {
    ...environment,
    deployment_id: output.deploymentId,
    web_app_url: webAppUrl
  };
  await writeFile(environmentPath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });

  console.log(`Created ${group.id} deployment.`);
  console.log(`Web app: ${webAppUrl}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
