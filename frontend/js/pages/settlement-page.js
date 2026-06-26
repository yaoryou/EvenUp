import { callApi } from "../api/client.js";
import { showDialog } from "../components/dialog.js";
import { showToast } from "../components/toast.js";
import { applyPreview, getState, setState } from "../app/store.js";
import { element } from "../utils/dom.js";
import { formatYen, parseYen } from "../utils/currency.js";
import { formatDateTime } from "../utils/datetime.js";
import { createRequestId } from "../utils/uuid.js";
import { validatePaymentInput } from "../utils/validation.js";

function memberName(memberId) {
  return getState().data.members.find((member) => member.member_id === memberId)?.name || memberId;
}

async function refreshPreview() {
  applyPreview(await callApi("settlement.preview"));
}

function createDirectCard(route) {
  const list = element(
    "ul",
    { className: "debt-list" },
    route.debts.map((debt) =>
      element("li", {}, [
        element("span", { text: debt.description }),
        element("span", { className: "amount", text: formatYen(debt.remaining_amount) })
      ])
    )
  );

  return element("article", { className: "card route-card" }, [
    element("div", { className: "route-members" }, [
      element("span", { text: memberName(route.from_member_id) }),
      element("span", { className: "route-arrow", text: "→" }),
      element("span", { text: memberName(route.to_member_id) })
    ]),
    element("div", { className: "split" }, [
      element("span", { className: "muted", text: "残り" }),
      element("strong", { className: "amount", text: formatYen(route.remaining_amount) })
    ]),
    list,
    element("button", {
      className: "button button-secondary button-block",
      type: "button",
      text: "この送金を記録",
      onClick: () => openDirectDialog(route)
    })
  ]);
}

function openDirectDialog(route) {
  const input = element("input", {
    className: "input",
    type: "number",
    min: 1,
    max: route.remaining_amount,
    value: route.remaining_amount,
    inputmode: "numeric"
  });
  const error = element("p", { className: "inline-error", role: "alert" });
  const content = element("div", { className: "stack" }, [
    element("p", { text: `${memberName(route.from_member_id)} → ${memberName(route.to_member_id)}` }),
    element("p", { className: "muted", text: "古い支払いから順に充当されます。" }),
    element("div", { className: "field" }, [element("label", { text: "送金額" }), input]),
    error
  ]);

  showDialog({
    title: "送金を記録",
    content,
    confirmLabel: "送金を記録",
    onConfirm: async () => {
      const amount = Number(input.value);
      if (!Number.isInteger(amount) || amount < 1 || amount > route.remaining_amount) {
        error.textContent = `1円から${formatYen(route.remaining_amount)}までで入力してください。`;
        return false;
      }
      const result = await callApi(
        "transfers.create_direct",
        {
          route_key: route.route_key,
          from_member_id: route.from_member_id,
          to_member_id: route.to_member_id,
          amount
        },
        createRequestId()
      );
      applyPreview(result.preview);
      showToast("個別精算を記録しました");
    }
  });
}

function createOptimizedContent(data) {
  if (!data.optimizedRoutes.length && !data.openPayments.length) {
    return element("div", { className: "card empty-state", text: "現在、未精算の残額はありません。" });
  }

  const routes = data.optimizedRoutes.map((route) =>
    element("article", { className: "card route-card" }, [
      element("div", { className: "route-members" }, [
        element("span", { text: memberName(route.from_member_id) }),
        element("span", { className: "route-arrow", text: "→" }),
        element("span", { text: memberName(route.to_member_id) })
      ]),
      element("strong", { className: "amount", text: formatYen(route.amount) })
    ])
  );

  const button = element("button", {
    className: "button button-primary button-block",
    type: "button",
    text: "全ルートを一括で記録",
    onClick: () => {
      const summary = element("div", { className: "stack" }, [
        element("p", { text: "表示された全ルートを実際に送金したことを確認してください。" }),
        ...data.optimizedRoutes.map((route) =>
          element("p", {
            text: `${memberName(route.from_member_id)} → ${memberName(route.to_member_id)} ${formatYen(route.amount)}`
          })
        )
      ]);
      showDialog({
        title: "まとめて精算しますか？",
        content: summary,
        confirmLabel: "一括で記録",
        onConfirm: async () => {
          const result = await callApi(
            "transfers.create_optimized",
            { snapshot_token: data.optimizedSnapshotToken },
            createRequestId()
          );
          applyPreview(result.preview);
          showToast("最適化精算を記録しました");
        }
      });
    }
  });

  return element("div", { className: "stack" }, [
    element("p", {
      className: "muted",
      text: "全員分をまとめたおすすめです。一部だけ実施する場合は個別精算を使います。"
    }),
    ...routes,
    button
  ]);
}

function paymentStatusLabel(status) {
  return {
    UNSETTLED: "未精算",
    PARTIALLY_SETTLED: "一部精算",
    SETTLED: "精算済み",
    CANCELLED: "取消済み"
  }[status] || status;
}

function createPaymentCard(payment) {
  return element("button", {
    className: "history-item",
    type: "button",
    onClick: () => openPaymentDialog(payment)
  }, [
    element("div", { className: "split" }, [
      element("span", { className: "badge badge-warning", text: paymentStatusLabel(payment.status) }),
      element("span", { className: "muted", text: formatDateTime(payment.paid_at) })
    ]),
    element("strong", { text: payment.description }),
    element("div", { className: "split" }, [
      element("span", { text: `${memberName(payment.paid_by)}が支払い` }),
      element("span", { className: "amount", text: formatYen(payment.amount) })
    ]),
    element("span", { className: "muted", text: `残り ${formatYen(payment.remaining_amount)}` })
  ]);
}

function openPaymentDialog(payment) {
  const members = getState().data.members.filter((member) => member.active);
  const editable = payment.allocated_amount === 0 && payment.status !== "CANCELLED";
  const selectedTargets = new Set(payment.shares.map((share) => share.member_id));
  const description = element("input", {
    className: "input",
    value: payment.description,
    maxlength: 100,
    disabled: !editable
  });
  const amount = element("input", {
    className: "input",
    value: payment.amount,
    inputmode: "numeric",
    disabled: !editable
  });
  const payer = element("select", { className: "select", disabled: !editable },
    members.map((member) => element("option", { value: member.member_id, text: member.name }))
  );
  payer.value = payment.paid_by;
  const chips = element("div", { className: "cluster" });
  for (const member of members) {
    const chip = element("button", {
      className: "chip",
      type: "button",
      text: member.name,
      disabled: !editable,
      "aria-pressed": String(selectedTargets.has(member.member_id)),
      onClick: () => {
        if (selectedTargets.has(member.member_id)) selectedTargets.delete(member.member_id);
        else selectedTargets.add(member.member_id);
        chip.setAttribute("aria-pressed", String(selectedTargets.has(member.member_id)));
      }
    });
    chips.append(chip);
  }
  const localError = element("p", { className: "inline-error", role: "alert" });
  const contentChildren = [
    element("p", { className: "muted", text: formatDateTime(payment.paid_at) }),
    element("div", { className: "field" }, [element("label", { text: "内容" }), description]),
    element("div", { className: "field" }, [element("label", { text: "金額" }), amount]),
    element("div", { className: "field" }, [element("label", { text: "支払った人" }), payer]),
    element("div", { className: "field" }, [element("span", { className: "field-label", text: "割り勘する人" }), chips]),
    element("ul", { className: "debt-list" }, payment.shares.map((share) =>
      element("li", {}, [
        element("span", { text: memberName(share.member_id) }),
        element("span", {
          text: `${formatYen(share.share_amount)} / 残り ${formatYen(share.remaining_amount)}`
        })
      ])
    )),
    localError
  ];

  if (!editable) {
    contentChildren.push(element("p", {
      className: "muted",
      text: "一部または全部が精算済みです。編集するには、関連する精算記録を新しい順に取り消してください。"
    }));
  } else {
    contentChildren.push(element("button", {
      className: "button button-danger",
      type: "button",
      text: "この支払いを取り消す",
      onClick: () => confirmPaymentCancel(payment)
    }));
  }

  showDialog({
    title: editable ? "支払いを編集" : "支払い詳細",
    content: element("div", { className: "stack" }, contentChildren),
    confirmLabel: editable ? "変更を保存" : "閉じる",
    showCancel: editable,
    onConfirm: async () => {
      if (!editable) return;
      const payload = {
        payment_id: payment.payment_id,
        expected_updated_at: payment.updated_at,
        description: description.value.trim(),
        amount: parseYen(amount.value),
        paid_by: payer.value,
        target_member_ids: [...selectedTargets]
      };
      const errors = validatePaymentInput({
        description: payload.description,
        amount: payload.amount,
        paidBy: payload.paid_by,
        targetMemberIds: payload.target_member_ids
      });
      if (Object.keys(errors).length) {
        localError.textContent = Object.values(errors)[0];
        return false;
      }
      await callApi("payments.update", payload, createRequestId());
      await refreshPreview();
      showToast("支払いを更新しました");
    }
  });
}

function confirmPaymentCancel(payment) {
  showDialog({
    title: "この支払いを取り消しますか？",
    content: element("div", { className: "stack" }, [
      element("strong", { text: payment.description }),
      element("span", { className: "amount", text: formatYen(payment.amount) }),
      element("p", { className: "muted", text: "履歴には取消済みとして残ります。" })
    ]),
    confirmLabel: "取り消す",
    danger: true,
    onConfirm: async () => {
      await callApi("payments.cancel", {
        payment_id: payment.payment_id,
        expected_updated_at: payment.updated_at
      }, createRequestId());
      await refreshPreview();
      showToast("支払いを取り消しました");
    }
  });
}

function createLatestBatchCard(batch) {
  if (!batch) return null;
  const routes = batch.transfers || [];
  return element("section", { className: "card stack" }, [
    element("div", { className: "split" }, [
      element("strong", { text: "直前の精算" }),
      element("span", { className: "badge", text: batch.mode === "OPTIMIZED" ? "最適化精算" : "個別精算" })
    ]),
    element("span", { className: "muted", text: formatDateTime(batch.transferred_at) }),
    ...routes.map((route) => element("div", { className: "split" }, [
      element("span", { text: `${memberName(route.from_member_id)} → ${memberName(route.to_member_id)}` }),
      element("span", { className: "amount", text: formatYen(route.amount) })
    ])),
    element("button", {
      className: "button button-danger",
      type: "button",
      text: "この精算記録を取り消す",
      onClick: () => confirmBatchCancel(batch)
    })
  ]);
}

function confirmBatchCancel(batch) {
  showDialog({
    title: "直前の精算記録を取り消しますか？",
    content: element("div", { className: "stack" }, [
      ...(batch.transfers || []).map((route) =>
        element("p", {
          text: `${memberName(route.from_member_id)} → ${memberName(route.to_member_id)} ${formatYen(route.amount)}`
        })
      ),
      element("p", {
        className: "muted",
        text: "残債は元に戻ります。実際の送金を自動で返金する機能ではありません。"
      })
    ]),
    confirmLabel: "記録を取り消す",
    danger: true,
    onConfirm: async () => {
      const result = await callApi("transfers.cancel_latest", {
        transfer_batch_id: batch.transfer_batch_id
      }, createRequestId());
      applyPreview(result.preview);
      showToast("精算記録を取り消しました");
    }
  });
}

export function createSettlementPage() {
  const state = getState();
  const data = state.data;
  const mode = state.ui.settlementMode;
  const segment = element("div", { className: "segment", role: "group", "aria-label": "精算方式" }, [
    element("button", {
      type: "button",
      text: "個別精算",
      "aria-pressed": String(mode === "DIRECT"),
      onClick: () => setState((current) => ({
        ...current,
        ui: { ...current.ui, settlementMode: "DIRECT" }
      }))
    }),
    element("button", {
      type: "button",
      text: "まとめて最適化",
      "aria-pressed": String(mode === "OPTIMIZED"),
      onClick: () => setState((current) => ({
        ...current,
        ui: { ...current.ui, settlementMode: "OPTIMIZED" }
      }))
    })
  ]);

  const content = mode === "DIRECT"
    ? data.directRoutes.length
      ? element("div", { className: "stack" }, data.directRoutes.map(createDirectCard))
      : element("div", { className: "card empty-state", text: "個別に精算する残額はありません。" })
    : createOptimizedContent(data);
  const latestBatch = createLatestBatchCard(data.latestCancellableTransferBatch);

  return element("main", { className: "page stack" }, [
    element("div", {}, [
      element("h2", { className: "page-heading", text: "精算" }),
      element("p", { className: "muted", text: `${data.openPayments.length}件の支払いに残額があります。` })
    ]),
    segment,
    content,
    element("section", { className: "stack" }, [
      element("h3", { text: "未精算の支払い" }),
      ...(data.openPayments.length
        ? data.openPayments.map(createPaymentCard)
        : [element("div", { className: "card empty-state", text: "未精算の支払いはありません。" })])
    ]),
    latestBatch
  ].filter(Boolean));
}
