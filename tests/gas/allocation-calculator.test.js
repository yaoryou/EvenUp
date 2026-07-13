import test from "node:test";
import assert from "node:assert/strict";
import { loadGasModules } from "../helpers/load-gas-module.js";

const { AllocationCalculator } = loadGasModules(["14_allocation_calculator.gs"]);

test("direct allocation uses FIFO and can stop partway through a debt", () => {
  const allocations = AllocationCalculator.direct(
    {
      remainingAmount: 1334,
      offsetAmount: 0,
      offsetDebts: [],
      primaryDebts: [
        { paymentId: "P1", debtorMemberId: "M2", creditorMemberId: "M1", remainingAmount: 334, paidAt: "2026-01-01" },
        { paymentId: "P2", debtorMemberId: "M2", creditorMemberId: "M1", remainingAmount: 1000, paidAt: "2026-01-02" }
      ]
    },
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

test("direct allocation clears reciprocal offset debts and cash difference", () => {
  const allocations = AllocationCalculator.direct(
    {
      remainingAmount: 700,
      offsetAmount: 300,
      offsetDebts: [
        { paymentId: "P2", debtorMemberId: "M1", creditorMemberId: "M2", remainingAmount: 300, paidAt: "2026-01-02" }
      ],
      primaryDebts: [
        { paymentId: "P1", debtorMemberId: "M2", creditorMemberId: "M1", remainingAmount: 1000, paidAt: "2026-01-01" }
      ]
    },
    700
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(allocations)),
    [
      { paymentId: "P2", memberId: "M1", allocatedAmount: 300, sortOrder: 1 },
      { paymentId: "P1", memberId: "M2", allocatedAmount: 1000, sortOrder: 2 }
    ]
  );
});
