EvenUp.DirectRouteCalculator = {
  calculate: function (debts) {
    var groups = {};
    debts.filter(function (debt) { return debt.remainingAmount > 0; }).forEach(function (debt) {
      var key = debt.debtorMemberId + "::" + debt.creditorMemberId;
      groups[key] = groups[key] || {
        routeKey: "",
        fromMemberId: debt.debtorMemberId,
        toMemberId: debt.creditorMemberId,
        remainingAmount: 0,
        debts: []
      };
      groups[key].remainingAmount += debt.remainingAmount;
      groups[key].debts.push(debt);
    });
    return Object.values(groups).map(function (group) {
      group.debts.sort(function (left, right) {
        return new Date(left.paidAt) - new Date(right.paidAt) ||
          String(left.paymentId).localeCompare(String(right.paymentId));
      });
      group.routeKey = [
        group.fromMemberId,
        group.toMemberId,
        group.debts.map(function (debt) {
          return debt.paymentId + ":" + debt.remainingAmount;
        }).join(",")
      ].join("|");
      return group;
    }).sort(function (left, right) {
      return left.fromMemberId.localeCompare(right.fromMemberId) ||
        left.toMemberId.localeCompare(right.toMemberId);
    });
  }
};
