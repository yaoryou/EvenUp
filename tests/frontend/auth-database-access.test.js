import test from "node:test";
import assert from "node:assert/strict";
import { loadDatabaseAccess, roleLabel } from "../../frontend/js/auth/database-access.js";

function createClient({ membership, members, membershipError = null, membersError = null }) {
  return {
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle() {
          assert.equal(table, "evenup_group_memberships");
          return Promise.resolve({ data: membership, error: membershipError });
        },
        order() {
          assert.equal(table, "evenup_members");
          return Promise.resolve({ data: members, error: membersError });
        }
      };
      return query;
    }
  };
}

test("database access resolves the signed-in member and visible members", async () => {
  const membership = { member_id: "member-brother", role: "ADMIN", active: true };
  const members = [
    { member_id: "member-brother", name: "兄", active: true, sort_order: 10 },
    { member_id: "member-sister", name: "妹", active: true, sort_order: 20 }
  ];

  const result = await loadDatabaseAccess(createClient({ membership, members }), {
    groupId: "nko",
    userId: "auth-user"
  });

  assert.equal(result.currentMember.name, "兄");
  assert.deepEqual(result.members, members);
  assert.equal(roleLabel(result.membership.role), "管理者");
});

test("database access reports an unprovisioned user without querying members", async () => {
  const result = await loadDatabaseAccess(createClient({ membership: null, members: [] }), {
    groupId: "nko",
    userId: "unknown-user"
  });

  assert.deepEqual(result, { membership: null, currentMember: null, members: [] });
});

test("role labels do not expose raw unknown values", () => {
  assert.equal(roleLabel("MEMBER"), "一般メンバー");
  assert.equal(roleLabel("OWNER"), "未設定");
});
