import test from "node:test";
import assert from "node:assert/strict";
import { validatePaymentInput } from "../../frontend/js/utils/validation.js";

test("valid payment input has no errors", () => {
  assert.deepEqual(
    validatePaymentInput({
      description: "ラーメン",
      amount: 1000,
      paidBy: "M001",
      targetMemberIds: ["M001", "M002"]
    }),
    {}
  );
});

test("empty targets are rejected", () => {
  const errors = validatePaymentInput({
    description: "ラーメン",
    amount: 1000,
    paidBy: "M001",
    targetMemberIds: []
  });
  assert.ok(errors.targetMemberIds);
});
