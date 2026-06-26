import test from "node:test";
import assert from "node:assert/strict";
import { loadGasModules } from "../helpers/load-gas-module.js";

const { DebtCalculator } = loadGasModules(["11_debt_calculator.gs"]);

test("active allocations reduce debt while payer share is excluded", () => {
  const debts = DebtCalculator.calculate(
    [{ payment_id: "P1", paid_by: "M1", description: "食事", paid_at: "2026-01-01", cancelled_at: "" }],
    [
      { payment_id: "P1", member_id: "M1", share_amount: 300 },
      { payment_id: "P1", member_id: "M2", share_amount: 400 }
    ],
    [{ transfer_batch_id: "B1", status: "ACTIVE" }],
    [{ transfer_batch_id: "B1", payment_id: "P1", member_id: "M2", allocated_amount: 150 }]
  );

  assert.equal(debts.length, 1);
  assert.equal(debts[0].remainingAmount, 250);
});
