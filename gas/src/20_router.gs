EvenUp.Router = {
  routes: {
    "auth.verify": "verifyAuth",
    "bootstrap": "bootstrap",
    "payments.create": "createPayment",
    "payments.update": "updatePayment",
    "payments.cancel": "cancelPayment",
    "history.list": "listHistory",
    "migration.export_snapshot": "exportMigrationSnapshot",
    "settlement.preview": "previewSettlement",
    "transfers.create_direct": "createDirectTransfer",
    "transfers.create_optimized": "createOptimizedTransfer",
    "transfers.cancel_latest": "cancelLatestTransfer"
  },

  dispatch: function (request) {
    if (request.api_version !== EvenUp.Config.API_VERSION) {
      throw new EvenUp.AppError("UNSUPPORTED_API_VERSION", "APIバージョンが対応していません。");
    }
    var methodName = this.routes[request.action];
    if (!methodName || typeof EvenUp.Actions[methodName] !== "function") {
      throw new EvenUp.AppError("UNKNOWN_ACTION", "未定義の操作です。");
    }
    EvenUp.Auth.verify(request.access_key);
    return EvenUp.Actions[methodName](request);
  }
};
