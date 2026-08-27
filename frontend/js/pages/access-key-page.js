import { callApi } from "../api/client.js";
import { CONFIG } from "../config.js";
import { getSupabaseClient } from "../auth/client.js";
import { element } from "../utils/dom.js";
import { setStored } from "../utils/storage.js";
import { bootstrapApp } from "../app/bootstrap.js";

export function createAccessKeyPage() {
  if (CONFIG.USE_SUPABASE) return createSupabaseLoginPage();
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
    element("div", {}, [
      element("h1", { text: CONFIG.APP_NAME }),
      element("p", { className: "group-name", text: CONFIG.GROUP_NAME })
    ]),
    element("p", { className: "muted", text: "このグループのアクセスキーを入力してください。" }),
    element("div", { className: "field" }, [
      element("label", { for: "access-key", text: "アクセスキー" }),
      input,
      error
    ]),
    button
  ]);
  return element("main", { className: "auth-layout" }, form);
}

function authErrorMessage(error) {
  if (error?.code === "invalid_credentials") return "メールアドレスまたはパスワードが正しくありません。";
  if (error?.code === "email_not_confirmed") return "メールアドレスの確認が完了していません。";
  return "ログインに失敗しました。通信状態を確認してください。";
}

function createSupabaseLoginPage() {
  const email = element("input", {
    className: "input",
    id: "auth-email",
    type: "email",
    inputmode: "email",
    autocomplete: "username",
    required: true
  });
  const password = element("input", {
    className: "input",
    id: "auth-password",
    type: "password",
    autocomplete: "current-password",
    required: true
  });
  const error = element("p", { className: "inline-error", role: "alert" });
  const button = element("button", {
    className: "button button-primary button-block",
    type: "submit",
    text: "ログイン"
  });
  const form = element("form", {
    className: "card auth-card stack",
    onSubmit: async (event) => {
      event.preventDefault();
      error.textContent = "";
      button.disabled = true;
      const { error: signInError } = await getSupabaseClient().auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value
      });
      if (signInError) {
        error.textContent = authErrorMessage(signInError);
        button.disabled = false;
        return;
      }
      await bootstrapApp();
      button.disabled = false;
    }
  }, [
    element("div", {}, [
      element("h1", { text: CONFIG.APP_NAME }),
      element("p", { className: "group-name", text: CONFIG.GROUP_NAME })
    ]),
    element("p", { className: "muted", text: "登録済みのメールアドレスとパスワードでログインしてください。" }),
    element("div", { className: "field" }, [
      element("label", { for: "auth-email", text: "メールアドレス" }),
      email
    ]),
    element("div", { className: "field" }, [
      element("label", { for: "auth-password", text: "パスワード" }),
      password
    ]),
    error,
    button
  ]);
  return element("main", { className: "auth-layout" }, form);
}
