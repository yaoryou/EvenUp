import { callApi } from "../api/client.js";
import { CONFIG } from "../config.js";
import { getStored } from "../utils/storage.js";
import { applyPreview, setState } from "./store.js";

export async function bootstrapApp() {
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
