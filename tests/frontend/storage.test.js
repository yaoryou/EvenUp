import test from "node:test";
import assert from "node:assert/strict";
import { migrateStoredKeys } from "../../frontend/js/utils/storage.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test("legacy storage migrates once into a group namespace", () => {
  const storage = memoryStorage({ evenup_access_key: "secret" });
  migrateStoredKeys([["evenup_access_key", "evenup:fate:access_key"]], storage);

  assert.equal(storage.getItem("evenup:fate:access_key"), "secret");
  assert.equal(storage.getItem("evenup_access_key"), null);
});

test("migration never overwrites an existing group value", () => {
  const storage = memoryStorage({
    evenup_access_key: "legacy",
    "evenup:fate:access_key": "current"
  });
  migrateStoredKeys([["evenup_access_key", "evenup:fate:access_key"]], storage);

  assert.equal(storage.getItem("evenup:fate:access_key"), "current");
  assert.equal(storage.getItem("evenup_access_key"), null);
});
