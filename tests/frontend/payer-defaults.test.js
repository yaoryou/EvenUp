import test from "node:test";
import assert from "node:assert/strict";
import { resolveDefaultPayerId } from "../../frontend/js/utils/payer-defaults.js";

const members = [
  { member_id: "M001", name: "ナカチ", active: true },
  { member_id: "M002", name: "シャ卿", active: true },
  { member_id: "M003", name: "チンピラ", active: false }
];

test("operator member is used as the default payer", () => {
  assert.equal(resolveDefaultPayerId({ members, operatorMemberId: "M002", lastPayerId: "M001" }), "M002");
});

test("last payer remains a fallback for existing local settings", () => {
  assert.equal(resolveDefaultPayerId({ members, operatorMemberId: "", lastPayerId: "M002" }), "M002");
});

test("inactive or unknown stored members fall back to the first active member", () => {
  assert.equal(resolveDefaultPayerId({ members, operatorMemberId: "M003", lastPayerId: "M999" }), "M001");
});
