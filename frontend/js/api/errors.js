export class ApiError extends Error {
  constructor(error) {
    super(error?.message || "処理に失敗しました。");
    this.name = "ApiError";
    this.code = error?.code || "INTERNAL_ERROR";
    this.fields = error?.fields || {};
    this.retryable = Boolean(error?.retryable);
  }
}
