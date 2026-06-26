EvenUp.Validation = {
  requireObject: function (value, field) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new EvenUp.AppError("VALIDATION_ERROR", "入力内容を確認してください。", (function () {
        var fields = {};
        fields[field] = "オブジェクトが必要です。";
        return fields;
      })());
    }
  },

  requireString: function (value, field, maxLength) {
    var normalized = String(value || "").trim();
    if (!normalized || (maxLength && normalized.length > maxLength)) {
      var fields = {};
      fields[field] = "値を確認してください。";
      throw new EvenUp.AppError("VALIDATION_ERROR", "入力内容を確認してください。", fields);
    }
    return normalized;
  },

  requireAmount: function (value, field) {
    if (!Number.isInteger(value) || value < 1 || value > 99999999) {
      var fields = {};
      fields[field] = "1円以上の整数を入力してください。";
      throw new EvenUp.AppError("VALIDATION_ERROR", "入力内容を確認してください。", fields);
    }
    return value;
  }
};

EvenUp.withScriptLock = function (callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(EvenUp.Config.LOCK_TIMEOUT_MS)) {
    throw new EvenUp.AppError("LOCK_TIMEOUT", "処理が混み合っています。もう一度お試しください。", {}, true);
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
};
