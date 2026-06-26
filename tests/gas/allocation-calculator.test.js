import test from "node:test";
import assert from "node:assert/strict";
import { loadGasModules } from "../helpers/load-gas-module.js";

const { AllocationCalculator } = loadGasModules(["14_allocation_calculator.gs"]);

test("direct allocation uses FIFO and can stop partway through a debt", () => {
  const allocations = AllocationCalculator.direct(
    [
      { paymentId: "P1", debtorMemberId: "M2", creditorMemberId: "M1", remainingAmount: 334, paidAt: "2026-01-01" },
      { paymentId: "P2", debtorMemberId: "M2", creditorMemberId: "M1", remainingAmount: 1000, paidAt: "2026-01-02" }
    ],
    "M2",
    "M1",
    1000
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(allocations)),
    [
      { paymentId: "P1", memberId: "M2", allocatedAmount: 334, sortOrder: 1 },
      { paymentId: "P2", memberId: "M2", allocatedAmount: 666, sortOrder: 2 }
    ]
  );
});
