const formatter = new Intl.NumberFormat("ja-JP");

export function formatYen(value) {
  return `${formatter.format(Number(value) || 0)}円`;
}

export function parseYen(value) {
  const normalized = String(value).replace(/[^\d]/g, "");
  return normalized ? Number(normalized) : 0;
}
