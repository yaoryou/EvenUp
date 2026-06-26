EvenUp.OptimizedRouteCalculator = {
  calculate: function (debts) {
    var balances = {};
    debts.filter(function (debt) { return debt.remainingAmount > 0; }).forEach(function (debt) {
      balances[debt.creditorMemberId] = (balances[debt.creditorMemberId] || 0) + debt.remainingAmount;
      balances[debt.debtorMemberId] = (balances[debt.debtorMemberId] || 0) - debt.remainingAmount;
    });
    var creditors = Object.keys(balances).filter(function (id) { return balances[id] > 0; })
      .map(function (id) { return { memberId: id, amount: balances[id] }; });
    var debtors = Object.keys(balances).filter(function (id) { return balances[id] < 0; })
      .map(function (id) { return { memberId: id, amount: -balances[id] }; });
    var compare = function (left, right) {
      return right.amount - left.amount || left.memberId.localeCompare(right.memberId);
    };
    creditors.sort(compare);
    debtors.sort(compare);

    var routes = [];
    var creditorIndex = 0;
    var debtorIndex = 0;
    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      var creditor = creditors[creditorIndex];
      var debtor = debtors[debtorIndex];
      var amount = Math.min(creditor.amount, debtor.amount);
      routes.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount: amount,
        sortOrder: routes.length + 1
      });
      creditor.amount -= amount;
      debtor.amount -= amount;
      if (creditor.amount === 0) creditorIndex += 1;
      if (debtor.amount === 0) debtorIndex += 1;
    }
    return routes;
  }
};
