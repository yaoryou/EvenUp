import test from "node:test";
import assert from "node:assert/strict";
import { authUserSnapshot } from "../../frontend/js/auth/session-view.js";

test("auth preview exposes user metadata but never session tokens", () => {
  const snapshot = authUserSnapshot({
    id: "user-id",
    email: "member@example.com",
    created_at: "2026-08-11T00:00:00Z",
    last_sign_in_at: "2026-08-11T01:00:00Z",
    app_metadata: { provider: "email" },
    user_metadata: { email_verified: true },
    access_token: "must-not-appear",
    refresh_token: "must-not-appear",
    identities: [{
      id: "identity-id",
      provider: "email",
      identity_data: { email: "member@example.com" }
    }]
  });

  assert.equal(snapshot.id, "user-id");
  assert.equal(snapshot.identities[0].provider, "email");
  assert.equal("access_token" in snapshot, false);
  assert.equal("refresh_token" in snapshot, false);
  assert.doesNotMatch(JSON.stringify(snapshot), /must-not-appear/);
});
