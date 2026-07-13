import test from "node:test";
import assert from "node:assert/strict";
import { loadGasModules } from "../helpers/load-gas-module.js";

const { DirectRouteCalculator } = loadGasModules(["12_direct_route_calculator.gs"]);

test("direct routes net reciprocal debts for the same two members", () => {
  const routes = DirectRouteCalculator.calculate([
    {
      paymentId: "P1",
      debtorMemberId: "M2",
      creditorMemberId: "M1",
      remainingAmount: 1000,
      paidAt: "2026-01-01",
      description: "宿"
    },
    {
      paymentId: "P2",
      debtorMemberId: "M1",
      creditorMemberId: "M2",
      remainingAmount: 300,
      paidAt: "2026-01-02",
      description: "タクシー"
    }
  ]);

  assert.equal(routes.length, 1);
  assert.equal(routes[0].fromMemberId, "M2");
  assert.equal(routes[0].toMemberId, "M1");
  assert.equal(routes[0].remainingAmount, 700);
  assert.equal(routes[0].offsetAmount, 300);
  assert.deepEqual(JSON.parse(JSON.stringify(routes[0].debts.map((debt) => debt.side))), ["PRIMARY", "OFFSET"]);
});

test("direct routes expose offset-only candidates when reciprocal debts are equal", () => {
  const routes = DirectRouteCalculator.calculate([
    {
      paymentId: "P1",
      debtorMemberId: "M2",
      creditorMemberId: "M1",
      remainingAmount: 500,
      paidAt: "2026-01-01",
      description: "宿"
    },
    {
      paymentId: "P2",
      debtorMemberId: "M1",
      creditorMemberId: "M2",
      remainingAmount: 500,
      paidAt: "2026-01-02",
      description: "タクシー"
    }
  ]);

  assert.equal(routes.length, 1);
  assert.equal(routes[0].remainingAmount, 0);
  assert.equal(routes[0].offsetAmount, 500);
  assert.equal(routes[0].isOffsetOnly, true);
});
