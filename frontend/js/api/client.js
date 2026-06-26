import { CONFIG } from "../config.js";
import { getStored, removeStored } from "../utils/storage.js";
import { ApiError } from "./errors.js";
import { callDemoApi } from "./demo.js";

export async function callApi(action, payload = {}, requestId = null) {
  if (CONFIG.USE_DEMO_DATA) return callDemoApi(action, payload, requestId);
  if (!CONFIG.API_URL) throw new ApiError({ code: "API_NOT_CONFIGURED", message: "API URLが未設定です。" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      redirect: "follow",
      signal: controller.signal,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        api_version: CONFIG.API_VERSION,
        action,
        access_key: getStored(CONFIG.STORAGE_KEYS.accessKey),
        request_id: requestId,
        payload
      })
    });
    const result = await response.json();
    if (!result.ok) {
      if (result.error?.code === "UNAUTHORIZED") removeStored(CONFIG.STORAGE_KEYS.accessKey);
      throw new ApiError(result.error);
    }
    return result.data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError({ code: "TIMEOUT", message: "通信がタイムアウトしました。", retryable: true });
    }
    throw error instanceof ApiError
      ? error
      : new ApiError({ code: "NETWORK_ERROR", message: "通信に失敗しました。", retryable: true });
  } finally {
    clearTimeout(timeout);
  }
}
