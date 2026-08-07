import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveDefaultTargetIds,
  resolveTargetSelectionMode,
  TARGET_SELECTION_MODES
} from "../../frontend/js/utils/target-defaults.js";

const members = [
  { member_id: "M001", active: true },
  { member_id: "M002", active: true },
  { member_id: "M003", active: false }
];

test("target selection defaults to none when no setting exists", () => {
  assert.equal(resolveTargetSelectionMode(null), TARGET_SELECTION_MODES.NONE);
  assert.deepEqual(resolveDefaultTargetIds({ members, mode: null }), []);
});

test("all mode selects every active member", () => {
  assert.deepEqual(
    resolveDefaultTargetIds({ members, mode: TARGET_SELECTION_MODES.ALL }),
    ["M001", "M002"]
  );
});

test("unknown target selection settings safely fall back to none", () => {
  assert.equal(resolveTargetSelectionMode("unexpected"), TARGET_SELECTION_MODES.NONE);
  assert.deepEqual(resolveDefaultTargetIds({ members, mode: "unexpected" }), []);
});
