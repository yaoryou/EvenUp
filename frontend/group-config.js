// This file mirrors the default entry in config/groups.json for local development.
// scripts/build-frontend.mjs generates one copy per group for production.
export const GROUP_CONFIG = Object.freeze({
  id: "fate",
  name: "チンパン",
  apiUrl: "https://script.google.com/macros/s/AKfycby19GzSavQH4XSGG769kr28j8JJH21EE6bt09LTD4UoDruSGpOIEvjjknOz_a5RK9kz/exec",
  useDemoData: false,
  migrateLegacyStorage: true,
  supabaseUrl: "",
  supabasePublishableKey: ""
});
