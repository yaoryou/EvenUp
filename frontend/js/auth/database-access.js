export async function loadDatabaseAccess(client, { groupId, userId }) {
  const { data: membership, error: membershipError } = await client
    .from("evenup_group_memberships")
    .select("member_id, role, active")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    return { membership: null, currentMember: null, members: [] };
  }

  const { data: members, error: membersError } = await client
    .from("evenup_members")
    .select("member_id, name, active, sort_order")
    .eq("group_id", groupId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (membersError) throw membersError;

  const visibleMembers = members ?? [];
  return {
    membership,
    currentMember: visibleMembers.find((member) => member.member_id === membership.member_id) ?? null,
    members: visibleMembers
  };
}

export function roleLabel(role) {
  if (role === "ADMIN") return "管理者";
  if (role === "MEMBER") return "一般メンバー";
  return "未設定";
}
