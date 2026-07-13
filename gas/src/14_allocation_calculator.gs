EvenUp.AllocationCalculator = {
  direct: function (route, amount) {
    var maxCashAmount = route.remainingAmount;
    if (!Number.isInteger(amount) || amount < 0 || amount > maxCashAmount) {
      throw new Error("invalid allocation amount");
    }
    if (maxCashAmount > 0 && amount < 1) {
      throw new Error("invalid allocation amount");
    }
    var allocations = [];

    this.allocateDebts(route.offsetDebts, route.offsetAmount, allocations);
    this.allocateDebts(route.primaryDebts, route.offsetAmount + amount, allocations);

    return allocations.map(function (allocation, index) {
      allocation.sortOrder = index + 1;
      return allocation;
    });
  },

  allocateDebts: function (debts, amount, allocations) {
    var remaining = amount;
    debts.forEach(function (debt) {
      if (!remaining) return;
      var allocatedAmount = Math.min(remaining, debt.remainingAmount);
      allocations.push({
        paymentId: debt.paymentId,
        memberId: debt.debtorMemberId,
        allocatedAmount: allocatedAmount,
        sortOrder: allocations.length + 1
      });
      remaining -= allocatedAmount;
    });
    if (remaining) throw new Error("invalid allocation amount");
  },

  optimized: function (debts) {
    return debts.filter(function (debt) { return debt.remainingAmount > 0; })
      .sort(function (left, right) {
        return String(left.paymentId).localeCompare(String(right.paymentId)) ||
          left.debtorMemberId.localeCompare(right.debtorMemberId);
      })
      .map(function (debt, index) {
        return {
          paymentId: debt.paymentId,
          memberId: debt.debtorMemberId,
          allocatedAmount: debt.remainingAmount,
          sortOrder: index + 1
        };
      });
  }
};
