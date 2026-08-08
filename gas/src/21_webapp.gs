EvenUp.WebApp = {
  handlePost: function (event) {
    var request = null;
    var startedAt = Date.now();
    EvenUp.ExecutionMetrics = { lock_wait_ms: null };
    EvenUp.SheetRepository.resetExecutionCache();
    try {
      request = JSON.parse(event.postData.contents);
      EvenUp.Validation.requireObject(request, "request");
      request.payload = request.payload || {};
      var response = EvenUp.Response.success(EvenUp.Router.dispatch(request), request.request_id);
      this.logExecution("SUCCESS", request, startedAt, null);
      return response;
    } catch (error) {
      this.logExecution("FAILURE", request, startedAt, error.code || "INTERNAL_ERROR");
      return EvenUp.Response.failure(error, request && request.request_id);
    }
  },

  logExecution: function (outcome, request, startedAt, errorCode) {
    var entry = {
      event: "API_EXECUTION",
      outcome: outcome,
      code: errorCode,
      request_id: request && request.request_id || null,
      action: request && request.action || null,
      duration_ms: Date.now() - startedAt,
      lock_wait_ms: EvenUp.ExecutionMetrics.lock_wait_ms,
      sheets: EvenUp.SheetRepository.metrics()
    };
    var serialized = JSON.stringify(entry);
    if (outcome === "SUCCESS") console.log(serialized);
    else console.error(serialized);
  }
};

function doPost(e) {
  return EvenUp.WebApp.handlePost(e);
}
