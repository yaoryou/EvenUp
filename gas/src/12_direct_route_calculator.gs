EvenUp.DirectRouteCalculator = {
  calculate: function (debts) {
    var groups = {};
    debts.filter(function (debt) { return debt.remainingAmount > 0; }).forEach(function (debt) {
      var members = [debt.debtorMemberId, debt.creditorMemberId].sort();
      var key = members[0] + "::" + members[1];
      groups[key] = groups[key] || {
        memberIds: members,
        byDirection: {}
      };
      var directionKey = debt.debtorMemberId + "::" + debt.creditorMemberId;
      groups[key].byDirection[directionKey] = groups[key].byDirection[directionKey] || {
        fromMemberId: debt.debtorMemberId,
        toMemberId: debt.creditorMemberId,
        amount: 0,
        debts: []
      };
      groups[key].byDirection[directionKey].amount += debt.remainingAmount;
      groups[key].byDirection[directionKey].debts.push(debt);
    });

    return Object.values(groups).map(function (group) {
      var directions = Object.values(group.byDirection).map(function (direction) {
        direction.debts.sort(EvenUp.DirectRouteCalculator.compareDebts);
        return direction;
      }).sort(function (left, right) {
        return right.amount - left.amount ||
          left.fromMemberId.localeCompare(right.fromMemberId) ||
          left.toMemberId.localeCompare(right.toMemberId);
      });
      var primary = directions[0];
      var offset = directions[1] || {
        fromMemberId: primary.toMemberId,
        toMemberId: primary.fromMemberId,
        amount: 0,
        debts: []
      };
      var isOffsetOnly = primary.amount === offset.amount;
      var primaryDebts = primary.debts.map(function (debt) {
        return EvenUp.DirectRouteCalculator.copyDebt(debt, "PRIMARY");
      });
      var offsetDebts = offset.debts.map(function (debt) {
        return EvenUp.DirectRouteCalculator.copyDebt(debt, "OFFSET");
      });
      var route = {
        routeKey: "",
        fromMemberId: isOffsetOnly ? group.memberIds[0] : primary.fromMemberId,
        toMemberId: isOffsetOnly ? group.memberIds[1] : primary.toMemberId,
        remainingAmount: primary.amount - offset.amount,
        offsetAmount: offset.amount,
        isOffsetOnly: isOffsetOnly,
        primaryDebts: primaryDebts,
        offsetDebts: offsetDebts,
        debts: primaryDebts.concat(offsetDebts)
      };
      route.routeKey = EvenUp.DirectRouteCalculator.routeKey(route);
      return route;
    }).filter(function (route) {
      return route.remainingAmount > 0 || route.offsetAmount > 0;
    }).sort(function (left, right) {
      return left.fromMemberId.localeCompare(right.fromMemberId) ||
        left.toMemberId.localeCompare(right.toMemberId);
    });
  },

  compareDebts: function (left, right) {
    return new Date(left.paidAt) - new Date(right.paidAt) ||
      String(left.paymentId).localeCompare(String(right.paymentId)) ||
      left.debtorMemberId.localeCompare(right.debtorMemberId) ||
      left.creditorMemberId.localeCompare(right.creditorMemberId);
  },

  copyDebt: function (debt, side) {
    return {
      paymentId: debt.paymentId,
      debtorMemberId: debt.debtorMemberId,
      creditorMemberId: debt.creditorMemberId,
      originalAmount: debt.originalAmount,
      allocatedAmount: debt.allocatedAmount,
      remainingAmount: debt.remainingAmount,
      paidAt: debt.paidAt,
      description: debt.description,
      side: side
    };
  },

  routeKey: function (route) {
    return [
      route.fromMemberId,
      route.toMemberId,
      route.remainingAmount,
      route.offsetAmount,
      route.debts.map(function (debt) {
        return [
          debt.side,
          debt.debtorMemberId,
          debt.creditorMemberId,
          debt.paymentId,
          debt.remainingAmount
        ].join(":");
      }).join(",")
    ].join("|");
  }
};
