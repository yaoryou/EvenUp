import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../../frontend/js/config.js";

test("frontend configuration scopes browser storage to the group", () => {
  assert.equal(CONFIG.GROUP_ID, "fate");
  assert.equal(CONFIG.GROUP_NAME, "チンパン");
  assert.equal(CONFIG.STORAGE_KEYS.accessKey, "evenup:fate:access_key");
  assert.equal(CONFIG.STORAGE_KEYS.operatorMemberId, "evenup:fate:operator_member_id");
  assert.equal(CONFIG.LEGACY_STORAGE_KEYS.accessKey, "evenup_access_key");
});
