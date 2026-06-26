EvenUp.SnapshotService = {
  create: function (debts) {
    var normalized = debts.filter(function (debt) { return debt.remainingAmount > 0; })
      .slice()
      .sort(function (left, right) {
        return String(left.paymentId).localeCompare(String(right.paymentId)) ||
          left.debtorMemberId.localeCompare(right.debtorMemberId);
      })
      .map(function (debt) {
        return [
          debt.paymentId,
          debt.debtorMemberId,
          debt.creditorMemberId,
          debt.originalAmount,
          debt.allocatedAmount,
          debt.remainingAmount
        ];
      });
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(normalized),
      Utilities.Charset.UTF_8
    );
    return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, "");
  }
};
