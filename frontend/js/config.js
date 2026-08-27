import { GROUP_CONFIG } from "../group-config.js";

const storagePrefix = `evenup:${GROUP_CONFIG.id}`;

export const CONFIG = Object.freeze({
  APP_NAME: "EvenUp",
  GROUP_ID: GROUP_CONFIG.id,
  GROUP_NAME: GROUP_CONFIG.name,
  API_URL: GROUP_CONFIG.apiUrl,
  API_VERSION: "v1",
  USE_DEMO_DATA: GROUP_CONFIG.useDemoData,
  SUPABASE_URL: GROUP_CONFIG.supabaseUrl,
  SUPABASE_PUBLISHABLE_KEY: GROUP_CONFIG.supabasePublishableKey,
  USE_SUPABASE: Boolean(GROUP_CONFIG.supabaseUrl && GROUP_CONFIG.supabasePublishableKey),
  SUPABASE_AUTH_STORAGE_KEY: `${storagePrefix}:supabase-auth-preview`,
  REQUEST_TIMEOUT_MS: 20_000,
  STORAGE_KEYS: {
    accessKey: `${storagePrefix}:access_key`,
    lastPayer: `${storagePrefix}:last_payer`,
    operatorMemberId: `${storagePrefix}:operator_member_id`,
    targetSelectionMode: `${storagePrefix}:target_selection_mode`,
    settlementMode: `${storagePrefix}:settlement_mode`
  },
  LEGACY_STORAGE_KEYS: GROUP_CONFIG.migrateLegacyStorage
    ? {
        accessKey: "evenup_access_key",
        lastPayer: "evenup_last_payer",
        operatorMemberId: "evenup_operator_member_id",
        settlementMode: "evenup_settlement_mode"
      }
    : null
});
