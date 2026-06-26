export function validatePaymentInput(input) {
  const errors = {};
  const description = String(input.description || "").trim();
  const amount = Number(input.amount);

  if (!description) errors.description = "内容を入力してください。";
  else if (description.length > 100) errors.description = "内容は100文字以内です。";

  if (!Number.isInteger(amount) || amount < 1 || amount > 99_999_999) {
    errors.amount = "1円以上99,999,999円以下の整数を入力してください。";
  }

  if (!input.paidBy) errors.paidBy = "支払った人を選択してください。";
  if (!Array.isArray(input.targetMemberIds) || input.targetMemberIds.length === 0) {
    errors.targetMemberIds = "割り勘する人を1人以上選択してください。";
  }

  return errors;
}
