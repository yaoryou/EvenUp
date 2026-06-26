EvenUp.Auth = {
  verify: function (accessKey) {
    if (!accessKey) {
      throw new EvenUp.AppError("UNAUTHORIZED", "アクセスキーが正しくありません。");
    }
    var expected = PropertiesService.getScriptProperties().getProperty("ACCESS_KEY_SHA256");
    if (!expected) {
      throw new EvenUp.AppError("INTERNAL_ERROR", "認証設定が完了していません。");
    }
    var actual = this.hash(accessKey);
    if (!this.constantTimeEquals(actual, expected)) {
      throw new EvenUp.AppError("UNAUTHORIZED", "アクセスキーが正しくありません。");
    }
  },

  hash: function (value) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
    return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, "");
  },

  constantTimeEquals: function (left, right) {
    if (left.length !== right.length) return false;
    var difference = 0;
    for (var index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }
};
