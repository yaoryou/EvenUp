import { callApi } from "../api/client.js";
import { CONFIG } from "../config.js";
import { getSupabaseClient } from "../auth/client.js";
import { getStored } from "../utils/storage.js";
import { setStored } from "../utils/storage.js";
import { applyPreview, setState } from "./store.js";

export async function bootstrapApp() {
  if (CONFIG.USE_SUPABASE) {
    const client = getSupabaseClient();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session?.user) {
      setState((state) => ({
        ...state,
        auth: { status: "unauthenticated", memberId: null, role: null, email: null }
      }));
      return;
    }
    try {
      const data = await callApi("bootstrap");
      applyPreview(data);
      if (data.current_user?.member_id) {
        setStored(CONFIG.STORAGE_KEYS.operatorMemberId, data.current_user.member_id);
      }
      setState((state) => ({
        ...state,
        auth: {
          ...state.auth,
          status: "authenticated",
          email: sessionData.session.user.email || null
        }
      }));
    } catch (error) {
      setState((state) => ({
        ...state,
        auth: {
          status: "unauthenticated",
          memberId: null,
          role: null,
          email: sessionData.session.user.email || null,
          error: error.message
        }
      }));
    }
    return;
  }

  const key = getStored(CONFIG.STORAGE_KEYS.accessKey);
  if (!key && !CONFIG.USE_DEMO_DATA) {
    setState((state) => ({ ...state, auth: { status: "unauthenticated" } }));
    return;
  }

  try {
    const data = await callApi("bootstrap");
    applyPreview(data);
    setState((state) => ({ ...state, auth: { status: "authenticated" } }));
  } catch {
    setState((state) => ({ ...state, auth: { status: "unauthenticated" } }));
  }
}
