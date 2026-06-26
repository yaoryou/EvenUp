import test from "node:test";
import assert from "node:assert/strict";
import { loadGasModules } from "../helpers/load-gas-module.js";

const { ShareCalculator } = loadGasModules(["10_share_calculator.gs"]);

test("remainder is assigned away from the payer first", () => {
  const shares = ShareCalculator.calculate(1000, "M001", ["M001", "M002", "M003"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(shares)),
    [
      { memberId: "M001", shareAmount: 333 },
      { memberId: "M002", shareAmount: 334 },
      { memberId: "M003", shareAmount: 333 }
    ]
  );
});

test("payer may be outside targets", () => {
  const shares = ShareCalculator.calculate(5, "M999", ["M001", "M002"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(shares)),
    [
      { memberId: "M001", shareAmount: 3 },
      { memberId: "M002", shareAmount: 2 }
    ]
  );
});
