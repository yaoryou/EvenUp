EvenUp.AllocationCalculator = {
  direct: function (debts, fromMemberId, toMemberId, amount) {
    var candidates = debts.filter(function (debt) {
      return debt.remainingAmount > 0 &&
        debt.debtorMemberId === fromMemberId &&
        debt.creditorMemberId === toMemberId;
    }).sort(function (left, right) {
      return new Date(left.paidAt) - new Date(right.paidAt) ||
        String(left.paymentId).localeCompare(String(right.paymentId));
    });
    var available = candidates.reduce(function (sum, debt) { return sum + debt.remainingAmount; }, 0);
    if (!Number.isInteger(amount) || amount < 1 || amount > available) throw new Error("invalid allocation amount");

    var remaining = amount;
    var allocations = [];
    candidates.forEach(function (debt) {
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
    return allocations;
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
