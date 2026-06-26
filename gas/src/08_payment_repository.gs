EvenUp.PaymentRepository = {
  list: function () {
    return EvenUp.SheetRepository.readAll("payments");
  },

  listShares: function () {
    return EvenUp.SheetRepository.readAll("payment_shares");
  },

  findByRequestId: function (requestId) {
    return this.list().find(function (payment) { return payment.request_id === requestId; }) || null;
  },

  findById: function (paymentId) {
    return this.list().find(function (payment) { return payment.payment_id === paymentId; }) || null;
  },

  update: function (payment) {
    EvenUp.SheetRepository.updateRow("payments", payment._rowNumber, payment);
  },

  replaceShares: function (paymentId, replacementShares) {
    var retained = this.listShares().filter(function (share) {
      return share.payment_id !== paymentId;
    });
    EvenUp.SheetRepository.replaceAll("payment_shares", retained.concat(replacementShares));
  }
};
