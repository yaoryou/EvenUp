import test from "node:test";
import assert from "node:assert/strict";
import { formatDateTime } from "../../frontend/js/utils/datetime.js";

test("date time display is fixed to JST", () => {
  assert.equal(formatDateTime("2026-07-13T00:30:00.000Z"), "7/13 09:30");
});
