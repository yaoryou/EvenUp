import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  groupIdFromArgs,
  loadEnvironment,
  loadGroups,
  pathExists,
  selectGroup,
  validateEnvironment
} from "./group-config.mjs";

const [command, ...args] = process.argv.slice(2);
const allowedCommands = new Set(["status", "push", "deployments", "deploy", "deploy-all", "validate", "retire"]);

if (!allowedCommands.has(command)) {
  throw new Error("Usage: node scripts/gas-groups.mjs <status|push|deployments|deploy|deploy-all|validate|retire> [--group <id>]");
}

const groups = await loadGroups();
const requestedGroupId = groupIdFromArgs(args);
const forcePush = args.includes("--force");
const clasp = resolve("node_modules/.bin/clasp");

function run(executable, executableArgs, options = {}) {
  const result = spawnSync(executable, executableArgs, {
    cwd: resolve("."),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : "";
    throw new Error(`${executable} exited with status ${result.status}.${detail}`);
  }
  return options.capture ? `${result.stdout || ""}${result.stderr || ""}` : "";
}

async function withProject(group, environment, callback) {
  const directory = await mkdtemp(join(tmpdir(), `evenup-${group.id}-`));
  const projectPath = join(directory, ".clasp.json");
  await writeFile(projectPath, `${JSON.stringify({
    scriptId: environment.script_id,
    rootDir: resolve("gas")
  }, null, 2)}\n`, { mode: 0o600 });
  try {
    return callback(projectPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function claspArgs(projectPath, ...commandArgs) {
  return [
    "--project",
    projectPath,
    "--ignore",
    resolve("gas/.claspignore"),
    ...commandArgs
  ];
}

async function contextFor(group, requiredFields) {
  const { environment, path } = await loadEnvironment(group);
  validateEnvironment(group, environment, requiredFields);
  return { group, environment, path };
}

async function validateGroup(group, requiredFields = ["script_id", "spreadsheet_id", "web_app_url"]) {
  const context = await contextFor(group, requiredFields);
  console.log(`OK ${group.id}: ${context.path}`);
  return context;
}

async function statusGroup(group) {
  const { environment } = await contextFor(group, ["script_id"]);
  console.log(`\n[${group.id}] ${group.name}`);
  await withProject(group, environment, (projectPath) => {
    run(clasp, claspArgs(projectPath, "status"));
  });
}

async function pushGroup(group, force) {
  const { environment } = await contextFor(group, ["script_id"]);
  console.log(`\n[${group.id}] pushing GAS source`);
  await withProject(group, environment, (projectPath) => {
    run(clasp, claspArgs(projectPath, "push", ...(force ? ["--force"] : [])));
  });
}

async function listDeployments(group) {
  const { environment } = await contextFor(group, ["script_id"]);
  console.log(`\n[${group.id}] deployments`);
  await withProject(group, environment, (projectPath) => {
    run(clasp, claspArgs(projectPath, "deployments"));
  });
}

function sourceLabel() {
  const hash = run("git", ["rev-parse", "--short", "HEAD"], { capture: true }).trim();
  const dirty = run("git", ["status", "--porcelain"], { capture: true }).trim();
  if (dirty) throw new Error("Commit or stash local changes before deploying GAS.");
  return `EvenUp ${hash}`;
}

async function deployGroup(group, label) {
  if (!group.enabled) {
    throw new Error(`${group.id}: enable the group in config/groups.json before deployment.`);
  }
  const { environment } = await contextFor(group, ["script_id", "deployment_id", "spreadsheet_id", "web_app_url"]);
  console.log(`\n[${group.id}] deploying ${label}`);
  await withProject(group, environment, (projectPath) => {
    run(clasp, claspArgs(projectPath, "push"));
    const versionOutput = run(clasp, claspArgs(projectPath, "version", label), { capture: true });
    const versionMatch = versionOutput.match(/(?:version\s+)(\d+)/i) || versionOutput.match(/(\d+)/);
    if (!versionMatch) throw new Error(`Could not read Apps Script version from: ${versionOutput.trim()}`);
    const version = versionMatch[1];
    run(clasp, claspArgs(
      projectPath,
      "redeploy",
      environment.deployment_id,
      "--versionNumber",
      version,
      "--description",
      label
    ));
  });
  console.log(`OK ${group.id}: ${label}`);
}

async function retireGroup(group) {
  const confirmIndex = args.indexOf("--confirm");
  if (confirmIndex === -1 || args[confirmIndex + 1] !== group.id) {
    throw new Error(`Retiring GAS requires --confirm ${group.id}.`);
  }
  if (!args.includes("--project-deleted")) {
    throw new Error(
      `Delete the container-bound Apps Script project in the Apps Script UI, then add --project-deleted.`
    );
  }
  if (!group.supabaseUrl || !group.supabasePublishableKey) {
    throw new Error(`${group.id}: Supabase must be configured before GAS retirement.`);
  }
  const { environment, path } = await loadEnvironment(group);
  validateEnvironment(group, environment, ["spreadsheet_id"]);

  const retiredEnvironment = {
    spreadsheet_id: environment.spreadsheet_id,
    gas_retired_at: new Date().toISOString()
  };
  await writeFile(path, `${JSON.stringify(retiredEnvironment, null, 2)}\n`, { mode: 0o600 });

  const legacyPath = resolve(".evenup-production.json");
  if (path !== legacyPath && await pathExists(legacyPath)) {
    const legacyEnvironment = JSON.parse(await readFile(legacyPath, "utf8"));
    if (environment.script_id && legacyEnvironment.script_id === environment.script_id) {
      await writeFile(legacyPath, `${JSON.stringify(retiredEnvironment, null, 2)}\n`, { mode: 0o600 });
    }
  }
  console.log(`OK ${group.id}: GAS retirement finalized; spreadsheet retained and private credentials removed`);
}

if (command === "deploy-all") {
  if (requestedGroupId) throw new Error("deploy-all does not accept --group.");
  console.log("Running pre-deployment checks...");
  run("npm", ["run", "check"]);
  run("npm", ["test"]);
  const enabledGroups = groups.filter((group) => group.enabled);
  for (const group of enabledGroups) {
    await validateGroup(group, ["script_id", "deployment_id", "spreadsheet_id", "web_app_url"]);
  }
  const label = sourceLabel();
  const completed = [];
  try {
    for (const group of enabledGroups) {
      await deployGroup(group, label);
      completed.push(group.id);
    }
  } catch (error) {
    console.error(`Deployment stopped. Completed groups: ${completed.join(", ") || "none"}`);
    throw error;
  }
  console.log(`\nAll groups deployed: ${completed.join(", ")} (${label})`);
} else if (command === "validate") {
  const targets = requestedGroupId
    ? [selectGroup(groups, requestedGroupId)]
    : groups.filter((group) => group.enabled);
  for (const group of targets) await validateGroup(group);
} else {
  const group = selectGroup(groups, requestedGroupId);
  if (command === "status") await statusGroup(group);
  if (command === "push") await pushGroup(group, forcePush);
  if (command === "deployments") await listDeployments(group);
  if (command === "deploy") {
    run("npm", ["run", "check"]);
    run("npm", ["test"]);
    await deployGroup(group, sourceLabel());
  }
  if (command === "retire") {
    run("npm", ["run", "check"]);
    run("npm", ["test"]);
    await retireGroup(group);
  }
}
