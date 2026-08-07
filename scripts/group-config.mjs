import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const GROUP_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const GROUP_PATH_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

export function validateGroups(document) {
  if (!document || !Array.isArray(document.groups) || document.groups.length === 0) {
    throw new Error("config/groups.json must contain at least one group.");
  }

  const ids = new Set();
  const paths = new Set();
  let defaultCount = 0;

  const groups = document.groups.map((entry, index) => {
    const prefix = `groups[${index}]`;
    const id = requireString(entry.id, `${prefix}.id`);
    const name = requireString(entry.name, `${prefix}.name`);
    const path = requireString(entry.path, `${prefix}.path`);
    const apiUrl = typeof entry.api_url === "string" ? entry.api_url.trim() : "";
    const useDemoData = entry.use_demo_data === true;
    const enabled = entry.enabled !== false;
    const isDefault = entry.default === true;

    if (!GROUP_ID_PATTERN.test(id)) {
      throw new Error(`${prefix}.id must use lowercase letters, numbers, and hyphens.`);
    }
    if (!GROUP_PATH_PATTERN.test(path)) {
      throw new Error(`${prefix}.path must be one URL-safe path segment.`);
    }
    if (ids.has(id)) throw new Error(`Duplicate group id: ${id}`);
    if (paths.has(path)) throw new Error(`Duplicate group path: ${path}`);
    if (enabled && !useDemoData && !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(apiUrl)) {
      throw new Error(`${prefix}.api_url must be a deployed Google Apps Script URL.`);
    }
    if (isDefault && !enabled) throw new Error(`${prefix} cannot be both default and disabled.`);

    ids.add(id);
    paths.add(path);
    if (isDefault) defaultCount += 1;

    return Object.freeze({
      id,
      name,
      path,
      apiUrl,
      useDemoData,
      enabled,
      default: isDefault,
      migrateLegacyStorage: entry.migrate_legacy_storage === true,
      legacyEnvironment: entry.legacy_environment === true
    });
  });

  if (defaultCount !== 1) throw new Error("Exactly one group must have default: true.");
  return Object.freeze(groups);
}

export async function loadGroups(path = resolve("config/groups.json")) {
  return validateGroups(JSON.parse(await readFile(path, "utf8")));
}

export function selectGroup(groups, groupId) {
  if (groupId) {
    const selected = groups.find((group) => group.id === groupId);
    if (!selected) throw new Error(`Unknown group: ${groupId}`);
    return selected;
  }
  if (groups.length === 1) return groups[0];
  throw new Error("Specify a group with --group <group-id>.");
}

export function groupIdFromArgs(args) {
  const index = args.indexOf("--group");
  if (index === -1) return null;
  if (!args[index + 1]) throw new Error("--group requires a group id.");
  return args[index + 1];
}

export async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function loadEnvironment(group) {
  const groupPath = resolve(`.evenup-groups/${group.id}.json`);
  const legacyPath = resolve(".evenup-production.json");
  const path = await pathExists(groupPath)
    ? groupPath
    : group.legacyEnvironment && await pathExists(legacyPath)
      ? legacyPath
      : null;

  if (!path) {
    throw new Error(`Private configuration is missing: .evenup-groups/${group.id}.json`);
  }
  const environment = JSON.parse(await readFile(path, "utf8"));
  return { environment, path };
}

export function validateEnvironment(group, environment, requiredFields = []) {
  for (const field of requiredFields) {
    if (typeof environment[field] !== "string" || !environment[field].trim()) {
      throw new Error(`${group.id}: private field ${field} is required.`);
    }
  }
  if (environment.web_app_url && environment.web_app_url !== group.apiUrl) {
    throw new Error(`${group.id}: web_app_url does not match config/groups.json.`);
  }
  return environment;
}
