import { bootstrapApp } from "./app/bootstrap.js";
import { startRouter } from "./app/router.js";
import { applyPreview, getState, resetStore, setState, subscribe } from "./app/store.js";
import { callApi } from "./api/client.js";
import { CONFIG } from "./config.js";
import { createAppShell } from "./components/app-shell.js";
import { showDialog } from "./components/dialog.js";
import { clear, element } from "./utils/dom.js";
import { removeStored } from "./utils/storage.js";
import { createAccessKeyPage } from "./pages/access-key-page.js";
import { createHistoryPage } from "./pages/history-page.js";
import { createRecordPage } from "./pages/record-page.js";
import { createSettlementPage } from "./pages/settlement-page.js";

const app = document.querySelector("#app");

function settingsDialog() {
  const status = element("p", { className: "muted", text: CONFIG.USE_DEMO_DATA ? "現在はデモデータで動作しています。" : "GAS APIに接続しています。" });
  const refresh = element("button", {
    className: "button button-secondary button-block",
    type: "button",
    text: "最新の状態を読み込む",
    onClick: async () => {
      refresh.disabled = true;
      try {
        applyPreview(await callApi("bootstrap"));
        status.textContent = "最新の状態に更新しました。";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        refresh.disabled = false;
      }
    }
  });
  showDialog({
    title: "設定",
    content: element("div", { className: "stack" }, [
      element("p", { className: "muted", text: "EvenUp v0.2.0" }),
      status,
      refresh
    ]),
    confirmLabel: "この端末からログアウト",
    danger: true,
    onConfirm: () => {
      removeStored(CONFIG.STORAGE_KEYS.accessKey);
      removeStored(CONFIG.STORAGE_KEYS.lastPayer);
      resetStore();
      setState((state) => ({ ...state, auth: { status: "unauthenticated" } }));
    }
  });
}

function render() {
  const state = getState();
  clear(app);

  if (state.auth.status === "checking") {
    app.append(element("main", { className: "loading-layout", text: "EvenUp 読み込み中…" }));
    return;
  }
  if (state.auth.status !== "authenticated") {
    app.append(createAccessKeyPage());
    return;
  }

  const pages = {
    record: createRecordPage,
    settlement: createSettlementPage,
    history: createHistoryPage
  };
  const page = (pages[state.ui.route] || createRecordPage)();
  app.append(createAppShell(state.ui.route, page, settingsDialog));
}

subscribe(render);
startRouter((route) => setState((state) => ({ ...state, ui: { ...state.ui, route } })));
render();
bootstrapApp();
