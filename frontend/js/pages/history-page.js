import { callApi } from "../api/client.js";
import { showDialog } from "../components/dialog.js";
import { getState, setState } from "../app/store.js";
import { element } from "../utils/dom.js";
import { formatYen } from "../utils/currency.js";
import { formatDateTime } from "../utils/datetime.js";

let loading = false;

function memberName(memberId) {
  return getState().data.members.find((member) => member.member_id === memberId)?.name || memberId;
}

function statusLabel(status) {
  return {
    UNSETTLED: "未精算",
    PARTIALLY_SETTLED: "一部精算",
    SETTLED: "精算済み",
    CANCELLED: "取消済み"
  }[status] || status;
}

function paymentDetail(payment) {
  showDialog({
    title: "支払い詳細",
    showCancel: false,
    confirmLabel: "閉じる",
    content: element("div", { className: "stack" }, [
      element("div", { className: "split" }, [
        element("span", { className: "badge badge-warning", text: statusLabel(payment.status) }),
        element("span", { className: "muted", text: formatDateTime(payment.paid_at) })
      ]),
      element("strong", { text: payment.description }),
      element("div", { className: "split" }, [
        element("span", { text: `${memberName(payment.paid_by)}が支払い` }),
        element("span", { className: "amount", text: formatYen(payment.amount) })
      ]),
      element("ul", { className: "debt-list" }, (payment.shares || []).map((share) =>
        element("li", {}, [
          element("span", { text: memberName(share.member_id) }),
          element("span", {
            text: `${formatYen(share.share_amount)} / 残り ${formatYen(share.remaining_amount)}`
          })
        ])
      ))
    ])
  });
}

function transferDetail(batch) {
  showDialog({
    title: batch.mode === "OPTIMIZED" ? "最適化精算の詳細" : "個別精算の詳細",
    showCancel: false,
    confirmLabel: "閉じる",
    content: element("div", { className: "stack" }, [
      element("div", { className: "split" }, [
        element("span", {
          className: `badge ${batch.status === "CANCELLED" ? "badge-warning" : "badge-success"}`,
          text: batch.status === "CANCELLED" ? "取消済み" : "有効"
        }),
        element("span", { className: "muted", text: formatDateTime(batch.transferred_at) })
      ]),
      element("h3", { text: "送金" }),
      ...(batch.transfers?.length
        ? batch.transfers.map((transfer) =>
          element("div", { className: "split" }, [
            element("span", {
              text: `${memberName(transfer.from_member_id)} → ${memberName(transfer.to_member_id)}`
            }),
            element("span", { className: "amount", text: formatYen(transfer.amount) })
          ]))
        : [element("p", { className: "muted", text: "実際の送金なしで相殺されました。" })]),
      element("h3", { text: "元の支払いへの充当" }),
      ...(batch.allocations || []).map((allocation) =>
        element("div", { className: "split" }, [
          element("span", {
            text: `${allocation.description || allocation.payment_id}（${memberName(allocation.member_id)}）`
          }),
          element("span", { className: "amount", text: formatYen(allocation.allocated_amount) })
        ]))
    ])
  });
}

function itemView(item) {
  if (item.type === "PAYMENT") {
    const payment = item.payment;
    return element("button", {
      className: "history-item",
      type: "button",
      onClick: () => paymentDetail(payment)
    }, [
      element("div", { className: "split" }, [
        element("span", { className: "muted", text: formatDateTime(item.occurred_at) }),
        element("span", { className: "badge badge-warning", text: statusLabel(payment.status) })
      ]),
      element("strong", { text: payment.description }),
      element("div", { className: "split" }, [
        element("span", { text: `${memberName(payment.paid_by)}が支払い` }),
        element("span", { className: "amount", text: formatYen(payment.amount) })
      ])
    ]);
  }

  const batch = item.transfer_batch;
  const total = (batch.transfers || []).reduce((sum, transfer) => sum + transfer.amount, 0);
  return element("button", {
    className: "history-item",
    type: "button",
    onClick: () => transferDetail(batch)
  }, [
    element("div", { className: "split" }, [
      element("span", { className: "muted", text: formatDateTime(item.occurred_at) }),
      element("span", {
        className: `badge ${batch.status === "CANCELLED" ? "badge-warning" : ""}`,
        text: batch.status === "CANCELLED"
          ? "取消済み"
          : batch.mode === "OPTIMIZED" ? "最適化精算" : "個別精算"
      })
    ]),
    element("strong", {
      text: batch.mode === "OPTIMIZED" ? "まとめて精算" : "個別精算"
    }),
    element("span", { className: "amount", text: formatYen(total) })
  ]);
}

async function loadHistory(append = false) {
  if (loading) return;
  loading = true;
  try {
    const history = getState().history;
    const result = await callApi("history.list", {
      type: history.type,
      cursor: append ? history.nextCursor : null,
      limit: 20
    });
    setState((state) => ({
      ...state,
      history: {
        ...state.history,
        items: append ? [...state.history.items, ...result.items] : result.items,
        nextCursor: result.next_cursor,
        hasMore: result.has_more,
        loaded: true,
        stale: false
      }
    }));
  } finally {
    loading = false;
  }
}

function changeType(type) {
  setState((state) => ({
    ...state,
    history: {
      ...state.history,
      type,
      items: [],
      nextCursor: null,
      hasMore: true,
      loaded: false,
      stale: true
    }
  }));
}

export function createHistoryPage() {
  const history = getState().history;
  const filter = element("div", { className: "history-filter", role: "group", "aria-label": "履歴種別" },
    [["ALL", "すべて"], ["PAYMENT", "支払い"], ["TRANSFER", "送金"]].map(([type, label]) =>
      element("button", {
        type: "button",
        text: label,
        "aria-pressed": String(history.type === type),
        onClick: () => changeType(type)
      })
    )
  );
  const container = element("main", { className: "page stack" }, [
    element("h2", { className: "page-heading", text: "履歴" }),
    filter
  ]);

  if (!history.loaded || history.stale) {
    container.append(element("div", { className: "card empty-state", text: "履歴を読み込み中…" }));
    queueMicrotask(() => loadHistory().catch((error) => {
      setState((state) => ({
        ...state,
        ui: { ...state.ui, banner: error.message },
        history: { ...state.history, loaded: true, stale: false }
      }));
    }));
    return container;
  }

  if (!history.items.length) {
    container.append(element("div", { className: "card empty-state", text: "該当する履歴はありません。" }));
    return container;
  }

  container.append(...history.items.map(itemView));
  if (history.hasMore) {
    container.append(element("button", {
      className: "button button-secondary button-block",
      type: "button",
      text: "さらに読み込む",
      onClick: () => loadHistory(true)
    }));
  }
  return container;
}
