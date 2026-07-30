export function resolveDefaultPayerId({ members, operatorMemberId, lastPayerId }) {
  const activeMembers = members.filter((member) => member.active);
  const activeIds = new Set(activeMembers.map((member) => member.member_id));
  if (operatorMemberId && activeIds.has(operatorMemberId)) return operatorMemberId;
  if (lastPayerId && activeIds.has(lastPayerId)) return lastPayerId;
  return activeMembers[0]?.member_id || "";
}
