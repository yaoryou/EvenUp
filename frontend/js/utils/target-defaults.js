export const TARGET_SELECTION_MODES = Object.freeze({
  NONE: "none",
  ALL: "all"
});

export function resolveTargetSelectionMode(value) {
  return value === TARGET_SELECTION_MODES.ALL
    ? TARGET_SELECTION_MODES.ALL
    : TARGET_SELECTION_MODES.NONE;
}

export function resolveDefaultTargetIds({ members, mode }) {
  if (resolveTargetSelectionMode(mode) !== TARGET_SELECTION_MODES.ALL) return [];
  return members
    .filter((member) => member.active !== false)
    .map((member) => member.member_id);
}
