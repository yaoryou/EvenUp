import { CONFIG } from "../config.js";
import { getSupabaseClient } from "../auth/client.js";
import { getStored, removeStored } from "../utils/storage.js";
import { ApiError } from "./errors.js";
import { callDemoApi } from "./demo.js";

export async function callApi(action, payload = {}, requestId = null) {
  if (CONFIG.USE_DEMO_DATA) return callDemoApi(action, payload, requestId);
  if (CONFIG.USE_SUPABASE) return callSupabaseApi(action, payload, requestId);
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

const SUPABASE_RPCS = {
  bootstrap: (payload, requestId) => ["evenup_bootstrap", { p_group_id: CONFIG.GROUP_ID }],
  "settlement.preview": (payload, requestId) => ["evenup_settlement_preview", { p_group_id: CONFIG.GROUP_ID }],
  "history.list": (payload) => ["evenup_history_list", {
    p_group_id: CONFIG.GROUP_ID,
    p_type: payload.type || "ALL",
    p_cursor: payload.cursor || null,
    p_limit: payload.limit || 20
  }],
  "payments.create": (payload, requestId) => ["evenup_payments_create", {
    p_group_id: CONFIG.GROUP_ID,
    p_request_id: requestId,
    p_description: payload.description,
    p_amount: payload.amount,
    p_paid_by: payload.paid_by,
    p_target_member_ids: payload.target_member_ids
  }],
  "payments.update": (payload, requestId) => ["evenup_payments_update", {
    p_group_id: CONFIG.GROUP_ID,
    p_request_id: requestId,
    p_payment_id: payload.payment_id,
    p_expected_updated_at: payload.expected_updated_at,
    p_description: payload.description,
    p_amount: payload.amount,
    p_paid_by: payload.paid_by,
    p_target_member_ids: payload.target_member_ids
  }],
  "payments.cancel": (payload, requestId) => ["evenup_payments_cancel", {
    p_group_id: CONFIG.GROUP_ID,
    p_request_id: requestId,
    p_payment_id: payload.payment_id,
    p_expected_updated_at: payload.expected_updated_at
  }],
  "transfers.create_direct": (payload, requestId) => ["evenup_transfers_create_direct", {
    p_group_id: CONFIG.GROUP_ID,
    p_request_id: requestId,
    p_route_key: payload.route_key,
    p_from_member_id: payload.from_member_id,
    p_to_member_id: payload.to_member_id,
    p_amount: payload.amount
  }],
  "transfers.create_optimized": (payload, requestId) => ["evenup_transfers_create_optimized", {
    p_group_id: CONFIG.GROUP_ID,
    p_request_id: requestId,
    p_snapshot_token: payload.snapshot_token
  }],
  "transfers.cancel_latest": (payload, requestId) => ["evenup_transfers_cancel_latest", {
    p_group_id: CONFIG.GROUP_ID,
    p_request_id: requestId,
    p_transfer_batch_id: payload.transfer_batch_id
  }]
};

async function withTimeout(promise) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new ApiError({
          code: "TIMEOUT",
          message: "通信がタイムアウトしました。",
          retryable: true
        })), CONFIG.REQUEST_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function executeSupabaseRpc(action, payload, requestId) {
  const definition = SUPABASE_RPCS[action];
  if (!definition) throw new ApiError({ code: "UNKNOWN_ACTION", message: "未定義の操作です。" });
  const [name, parameters] = definition(payload, requestId);
  const { data, error } = await withTimeout(getSupabaseClient().rpc(name, parameters));
  if (error) {
    const unauthorized = error.status === 401 || error.code === "PGRST301";
    throw new ApiError({
      code: unauthorized ? "UNAUTHORIZED" : "NETWORK_ERROR",
      message: unauthorized ? "ログインし直してください。" : "通信に失敗しました。",
      retryable: !unauthorized
    });
  }
  if (!data?.ok) throw new ApiError(data?.error || { code: "INTERNAL_ERROR", message: "処理に失敗しました。" });
  return data.data;
}

async function callSupabaseApi(action, payload, requestId) {
  if (action === "auth.verify") {
    const { data, error } = await withTimeout(getSupabaseClient().auth.getUser());
    if (error || !data.user) throw new ApiError({ code: "UNAUTHORIZED", message: "ログインし直してください。" });
    return { authenticated: true };
  }
  const data = await executeSupabaseRpc(action, payload, requestId);
  if (action.startsWith("transfers.")) {
    data.preview = await executeSupabaseRpc("settlement.preview", {}, null);
  }
  return data;
}
