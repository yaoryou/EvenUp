EvenUp.ShareCalculator = {
  calculate: function (amount, paidBy, targetMemberIds) {
    if (!Number.isInteger(amount) || amount < 1) throw new Error("amount must be a positive integer");
    var targets = Array.from(new Set(targetMemberIds)).sort();
    if (!targets.length) throw new Error("at least one target is required");

    var base = Math.floor(amount / targets.length);
    var remainder = amount % targets.length;
    var remainderOrder = targets.filter(function (memberId) { return memberId !== paidBy; });
    if (targets.indexOf(paidBy) >= 0) remainderOrder.push(paidBy);

    var extras = {};
    remainderOrder.slice(0, remainder).forEach(function (memberId) { extras[memberId] = 1; });
    return targets.map(function (memberId) {
      return { memberId: memberId, shareAmount: base + (extras[memberId] || 0) };
    });
  }
};
