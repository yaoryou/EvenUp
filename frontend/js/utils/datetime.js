const formatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

export function formatDateTime(value) {
  return value ? formatter.format(new Date(value)) : "";
}
