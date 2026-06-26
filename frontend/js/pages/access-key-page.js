import { callApi } from "../api/client.js";
import { CONFIG } from "../config.js";
import { element } from "../utils/dom.js";
import { setStored } from "../utils/storage.js";
import { bootstrapApp } from "../app/bootstrap.js";

export function createAccessKeyPage() {
  const input = element("input", {
    className: "input",
    id: "access-key",
    type: "password",
    autocomplete: "current-password"
  });
  const error = element("p", { className: "inline-error", role: "alert" });
  const button = element("button", { className: "button button-primary button-block", type: "submit", text: "はじめる" });
  const form = element("form", {
    className: "card auth-card stack",
    onSubmit: async (event) => {
      event.preventDefault();
      error.textContent = "";
      button.disabled = true;
      try {
        setStored(CONFIG.STORAGE_KEYS.accessKey, input.value.trim());
        await callApi("auth.verify");
        await bootstrapApp();
      } catch {
        error.textContent = "アクセスキーが正しくないか、通信に失敗しました。";
      } finally {
        button.disabled = false;
      }
    }
  }, [
    element("h1", { text: "EvenUp" }),
    element("p", { className: "muted", text: "グループのアクセスキーを入力してください。" }),
    element("div", { className: "field" }, [
      element("label", { for: "access-key", text: "アクセスキー" }),
      input,
      error
    ]),
    button
  ]);
  return element("main", { className: "auth-layout" }, form);
}
