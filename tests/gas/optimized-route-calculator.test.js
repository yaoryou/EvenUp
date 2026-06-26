import test from "node:test";
import assert from "node:assert/strict";
import { loadGasModules } from "../helpers/load-gas-module.js";

const { OptimizedRouteCalculator } = loadGasModules(["13_optimized_route_calculator.gs"]);

test("optimized routes settle all balances", () => {
  const routes = OptimizedRouteCalculator.calculate([
    { debtorMemberId: "M2", creditorMemberId: "M1", remainingAmount: 1000 },
    { debtorMemberId: "M3", creditorMemberId: "M2", remainingAmount: 400 }
  ]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(routes)),
    [
      { fromMemberId: "M2", toMemberId: "M1", amount: 600, sortOrder: 1 },
      { fromMemberId: "M3", toMemberId: "M1", amount: 400, sortOrder: 2 }
    ]
  );
});
