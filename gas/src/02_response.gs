EvenUp.AppError = function (code, message, fields, retryable) {
  this.name = "AppError";
  this.code = code;
  this.message = message;
  this.fields = fields || {};
  this.retryable = Boolean(retryable);
};

EvenUp.Response = {
  success: function (data, requestId) {
    return this.json({
      ok: true,
      data: data || {},
      meta: this.meta(requestId)
    });
  },

  failure: function (error, requestId) {
    var appError = error instanceof EvenUp.AppError
      ? error
      : new EvenUp.AppError("INTERNAL_ERROR", "処理に失敗しました。", {}, false);
    return this.json({
      ok: false,
      error: {
        code: appError.code,
        message: appError.message,
        fields: appError.fields,
        retryable: appError.retryable
      },
      meta: this.meta(requestId)
    });
  },

  meta: function (requestId) {
    return {
      api_version: EvenUp.Config.API_VERSION,
      request_id: requestId || null,
      server_time: EvenUp.DateTime.now()
    };
  },

  json: function (body) {
    return ContentService
      .createTextOutput(JSON.stringify(body))
      .setMimeType(ContentService.MimeType.JSON);
  }
};
