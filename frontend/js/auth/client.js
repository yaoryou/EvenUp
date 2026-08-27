import { CONFIG } from "../config.js";

let client = null;

export function getSupabaseClient() {
  if (!CONFIG.USE_SUPABASE || !window.supabase?.createClient) {
    throw new Error("Supabase認証の設定がありません。");
  }
  if (!client) {
    client = window.supabase.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: CONFIG.SUPABASE_AUTH_STORAGE_KEY
        }
      }
    );
  }
  return client;
}
