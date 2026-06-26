EvenUp.Actions = {
  verifyAuth: function () {
    return { authenticated: true };
  },

  bootstrap: function () {
    return EvenUp.QueryService.preview();
  },

  createPayment: function (request) {
    return EvenUp.withScriptLock(function () {
      return EvenUp.PaymentService.create(request.payload, request.request_id);
    });
  },

  updatePayment: function (request) {
    return EvenUp.withScriptLock(function () {
      return EvenUp.PaymentService.update(request.payload);
    });
  },

  cancelPayment: function (request) {
    return EvenUp.withScriptLock(function () {
      return EvenUp.PaymentService.cancel(request.payload);
    });
  },

  previewSettlement: function () {
    return EvenUp.QueryService.preview();
  },

  createDirectTransfer: function (request) {
    return EvenUp.withScriptLock(function () {
      return EvenUp.TransferService.createDirect(request.payload, request.request_id);
    });
  },

  createOptimizedTransfer: function (request) {
    return EvenUp.withScriptLock(function () {
      return EvenUp.TransferService.createOptimized(request.payload, request.request_id);
    });
  },

  cancelLatestTransfer: function (request) {
    return EvenUp.withScriptLock(function () {
      return EvenUp.TransferService.cancelLatest(request.payload, request.request_id);
    });
  },

  listHistory: function (request) {
    return EvenUp.QueryService.history(request.payload);
  }
};
