import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { loadGroups, selectGroup, validateEnvironment, validateGroups } from "../../scripts/group-config.mjs";
import { GROUP_CONFIG } from "../../frontend/group-config.js";

test("repository group configuration has one default and unique output paths", async () => {
  const groups = await loadGroups();
  assert.equal(groups.filter((group) => group.default).length, 1);
  assert.equal(new Set(groups.map((group) => group.path)).size, groups.length);
  const main = selectGroup(groups, "fate");
  assert.deepEqual(GROUP_CONFIG, {
    id: main.id,
    name: main.name,
    apiUrl: main.apiUrl,
    useDemoData: main.useDemoData,
    migrateLegacyStorage: main.migrateLegacyStorage,
    supabaseUrl: main.supabaseUrl,
    supabasePublishableKey: main.supabasePublishableKey
  });
});

test("disabled groups are valid without a deployed API URL", () => {
  const groups = validateGroups({
    groups: [
      {
        id: "primary",
        name: "Primary",
        path: "primary",
        api_url: "https://script.google.com/macros/s/primary/exec",
        enabled: true,
        default: true
      },
      {
        id: "pending",
        name: "Pending",
        path: "pending",
        api_url: "",
        enabled: false,
        default: false
      }
    ]
  });
  const pending = selectGroup(groups, "pending");
  assert.equal(pending.enabled, false);
  assert.equal(pending.apiUrl, "");
});

test("enabled Supabase groups are valid without a GAS URL", () => {
  const group = validateGroups({
    groups: [{
      id: "supabase-only",
      name: "Supabase only",
      path: "supabase-only",
      api_url: "",
      supabase_url: "https://projectref.supabase.co",
      supabase_publishable_key: "sb_publishable_EXAMPLE",
      enabled: true,
      default: true
    }]
  })[0];
  assert.equal(group.apiUrl, "");
  assert.equal(group.supabaseUrl, "https://projectref.supabase.co");
});

test("enabled groups must configure a backend", () => {
  assert.throws(
    () => validateGroups({ groups: [{
      id: "missing",
      name: "Missing",
      path: "missing",
      api_url: "",
      enabled: true,
      default: true
    }] }),
    /either a GAS or Supabase backend/
  );
});

test("example configuration is valid for multiple groups", async () => {
  const groups = await loadGroups(resolve("config/groups.example.json"));
  assert.equal(groups.length, 2);
  assert.equal(selectGroup(groups, "second-group").path, "second-group");
});

test("duplicate group ids are rejected", () => {
  const group = {
    id: "same",
    name: "Group",
    path: "group",
    api_url: "https://script.google.com/macros/s/example/exec",
    default: true
  };
  assert.throws(
    () => validateGroups({ groups: [group, { ...group, path: "other", default: false }] }),
    /Duplicate group id/
  );
});

test("Supabase public configuration must be supplied as a valid pair", () => {
  const base = {
    id: "sample",
    name: "Sample",
    path: "sample",
    api_url: "https://script.google.com/macros/s/example/exec",
    default: true
  };
  assert.throws(
    () => validateGroups({ groups: [{ ...base, supabase_url: "https://example.supabase.co" }] }),
    /configured together/
  );
  assert.throws(
    () => validateGroups({ groups: [{
      ...base,
      supabase_url: "https://example.invalid",
      supabase_publishable_key: "sb_publishable_example"
    }] }),
    /hosted Supabase project URL/
  );
});

test("private and public web app URLs must agree", () => {
  const group = validateGroups({
    groups: [{
      id: "sample",
      name: "Sample",
      path: "sample",
      api_url: "https://script.google.com/macros/s/public/exec",
      default: true
    }]
  })[0];
  assert.throws(
    () => validateEnvironment(group, { web_app_url: "https://script.google.com/macros/s/private/exec" }),
    /does not match/
  );
});
