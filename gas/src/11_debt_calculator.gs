EvenUp.DebtCalculator = {
  calculate: function (payments, shares, batches, allocations) {
    var activeBatchIds = new Set(
      batches.filter(function (batch) { return batch.status === "ACTIVE"; })
        .map(function (batch) { return batch.transfer_batch_id; })
    );
    var allocatedByDebt = {};
    allocations.forEach(function (allocation) {
      if (!activeBatchIds.has(allocation.transfer_batch_id)) return;
      var key = allocation.payment_id + "::" + allocation.member_id;
      allocatedByDebt[key] = (allocatedByDebt[key] || 0) + Number(allocation.allocated_amount);
    });
    var paymentsById = {};
    payments.forEach(function (payment) { paymentsById[payment.payment_id] = payment; });

    return shares.flatMap(function (share) {
      var payment = paymentsById[share.payment_id];
      if (!payment || payment.cancelled_at || share.member_id === payment.paid_by) return [];
      var key = share.payment_id + "::" + share.member_id;
      var original = Number(share.share_amount);
      var allocated = allocatedByDebt[key] || 0;
      if (allocated > original) throw new Error("allocation exceeds debt");
      return [{
        paymentId: share.payment_id,
        debtorMemberId: share.member_id,
        creditorMemberId: payment.paid_by,
        originalAmount: original,
        allocatedAmount: allocated,
        remainingAmount: original - allocated,
        paidAt: payment.paid_at,
        description: payment.description
      }];
    });
  }
};
