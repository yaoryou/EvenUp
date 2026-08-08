import { callApi } from "../api/client.js";
import { CONFIG } from "../config.js";
import { showToast } from "../components/toast.js";
import { applyPreview, getState } from "../app/store.js";
import { element } from "../utils/dom.js";
import { parseYen } from "../utils/currency.js";
import { getStored } from "../utils/storage.js";
import { resolveDefaultPayerId } from "../utils/payer-defaults.js";
import { resolveDefaultTargetIds } from "../utils/target-defaults.js";
import { createRequestId } from "../utils/uuid.js";
import { createPendingRequestTracker } from "../utils/pending-request.js";
import { validatePaymentInput } from "../utils/validation.js";

const pendingCreateRequests = createPendingRequestTracker(createRequestId);

export function createRecordPage() {
  const members = getState().data.members.filter((member) => member.active);
  const description = element("input", { className: "input", id: "description", maxlength: 100, placeholder: "例：ラーメン" });
  const amount = element("input", { className: "input", id: "amount", inputmode: "numeric", placeholder: "1,000" });
  const payer = element(
    "select",
    { className: "select", id: "paid-by" },
    members.map((member) => element("option", { value: member.member_id, text: member.name }))
  );
  payer.value = resolveDefaultPayerId({
    members,
    operatorMemberId: getStored(CONFIG.STORAGE_KEYS.operatorMemberId),
    lastPayerId: getStored(CONFIG.STORAGE_KEYS.lastPayer)
  });

  const defaultTargetIds = resolveDefaultTargetIds({
    members,
    mode: getStored(CONFIG.STORAGE_KEYS.targetSelectionMode)
  });
  const selected = new Set(defaultTargetIds);
  const targetChips = new Map();
  const chips = element("div", { className: "cluster" });
  for (const member of members) {
    const chip = element("button", {
      className: "chip",
      type: "button",
      text: member.name,
      "aria-pressed": String(selected.has(member.member_id)),
      onClick: () => {
        if (selected.has(member.member_id)) selected.delete(member.member_id);
        else selected.add(member.member_id);
        chip.setAttribute("aria-pressed", String(selected.has(member.member_id)));
      }
    });
    targetChips.set(member.member_id, chip);
    chips.append(chip);
  }

  const resetTargetSelection = () => {
    selected.clear();
    for (const memberId of defaultTargetIds) selected.add(memberId);
    for (const [memberId, chip] of targetChips) {
      chip.setAttribute("aria-pressed", String(selected.has(memberId)));
    }
  };

  const error = element("p", { className: "inline-error", role: "alert" });
  const submit = element("button", { className: "button button-primary button-block", type: "submit", text: "記録する" });
  const form = element("form", {
    className: "stack",
    onSubmit: async (event) => {
      event.preventDefault();
      const payload = {
        description: description.value.trim(),
        amount: parseYen(amount.value),
        paid_by: payer.value,
        target_member_ids: [...selected]
      };
      const validation = validatePaymentInput({
        description: payload.description,
        amount: payload.amount,
        paidBy: payload.paid_by,
        targetMemberIds: payload.target_member_ids
      });
      if (Object.keys(validation).length) {
        error.textContent = Object.values(validation)[0];
        return;
      }

      submit.disabled = true;
      error.textContent = "";
      const requestId = pendingCreateRequests.idFor(payload);
      try {
        await callApi("payments.create", payload, requestId);
        pendingCreateRequests.complete(requestId);
        description.value = "";
        amount.value = "";
        resetTargetSelection();
        showToast("記録しました");

        try {
          const preview = await callApi("settlement.preview");
          applyPreview(preview);
        } catch {
          showToast("記録済みです。最新表示の取得に失敗しました。");
        }
      } catch (apiError) {
        pendingCreateRequests.fail(requestId, apiError.retryable);
        error.textContent = apiError.message;
      } finally {
        submit.disabled = false;
      }
    }
  }, [
    element("div", { className: "field" }, [element("label", { for: "description", text: "内容" }), description]),
    element("div", { className: "field" }, [element("label", { for: "amount", text: "金額" }), amount]),
    element("div", { className: "field" }, [element("label", { for: "paid-by", text: "支払った人" }), payer]),
    element("div", { className: "field" }, [element("span", { className: "field-label", text: "割り勘する人" }), chips]),
    error,
    element("div", { className: "form-actions" }, submit)
  ]);

  return element("main", { className: "page stack" }, [
    element("div", {}, [element("h2", { className: "page-heading", text: "支払いを記録" }), element("p", { className: "muted", text: "立て替えた内容をその場で追加します。" })]),
    element("section", { className: "card" }, form)
  ]);
}
