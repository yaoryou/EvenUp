import { CONFIG } from "./config.js";
import { getSupabaseClient } from "./auth/client.js";
import { loadDatabaseAccess, roleLabel } from "./auth/database-access.js";
import { authUserSnapshot } from "./auth/session-view.js";
import { announce, clear, element } from "./utils/dom.js";

const app = document.querySelector("#app");

function messageFromAuthError(error) {
  if (!error) return "認証に失敗しました。";
  if (error.code === "invalid_credentials") {
    return "メールアドレスまたはパスワードが正しくありません。";
  }
  if (error.code === "email_not_confirmed") {
    return "メールアドレスが確認済みになっていません。管理者に連絡してください。";
  }
  return `認証に失敗しました。(${error.code || "unknown"})`;
}

function projectHost() {
  try {
    return new URL(CONFIG.SUPABASE_URL).host;
  } catch {
    return "未設定";
  }
}

function renderUnavailable() {
  clear(app);
  app.append(element("main", { className: "auth-layout" },
    element("section", { className: "card auth-card stack" }, [
      element("div", {}, [
        element("h1", { text: "Supabase認証検証" }),
        element("p", { className: "group-name", text: CONFIG.GROUP_NAME })
      ]),
      element("p", {
        className: "inline-error",
        text: "このグループにはSupabaseの公開設定がありません。"
      }),
      element("a", { className: "button button-secondary auth-preview-link", href: "./", text: "アプリへ戻る" })
    ])
  ));
}

function renderSignedOut(client) {
  const email = element("input", {
    className: "input",
    id: "auth-email",
    name: "email",
    type: "email",
    inputmode: "email",
    autocomplete: "username",
    required: true
  });
  const password = element("input", {
    className: "input",
    id: "auth-password",
    name: "password",
    type: "password",
    autocomplete: "current-password",
    required: true
  });
  const error = element("p", { className: "inline-error", role: "alert" });
  const submit = element("button", {
    className: "button button-primary button-block",
    type: "submit",
    text: "ログインを検証"
  });
  const form = element("form", {
    className: "card auth-card stack",
    onSubmit: async (event) => {
      event.preventDefault();
      error.textContent = "";
      submit.disabled = true;
      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value
      });
      if (signInError) {
        error.textContent = messageFromAuthError(signInError);
        announce(error.textContent);
        submit.disabled = false;
      }
    }
  }, [
    element("div", {}, [
      element("h1", { text: "Supabase認証検証" }),
      element("p", { className: "group-name", text: CONFIG.GROUP_NAME })
    ]),
    element("p", {
      className: "muted",
      text: "既存のNKOには影響しない、メールアドレス＋パスワード認証だけの検証画面です。"
    }),
    element("dl", { className: "auth-preview-summary" }, [
      element("div", {}, [element("dt", { text: "接続先" }), element("dd", { text: projectHost() })]),
      element("div", {}, [element("dt", { text: "公開登録" }), element("dd", { text: "使用しません" })]),
      element("div", {}, [element("dt", { text: "Google連携" }), element("dd", { text: "なし" })])
    ]),
    element("div", { className: "field" }, [
      element("label", { for: "auth-email", text: "メールアドレス" }),
      email
    ]),
    element("div", { className: "field" }, [
      element("label", { for: "auth-password", text: "パスワード" }),
      password
    ]),
    error,
    submit,
    element("a", { className: "auth-preview-back", href: "./", text: "現在のNKOへ戻る" })
  ]);

  clear(app);
  app.append(element("main", { className: "auth-layout" }, form));
}

function renderSignedIn(client, user) {
  const snapshot = authUserSnapshot(user);
  const databaseStatus = element("p", {
    className: "muted",
    text: "データベースのアクセス権を確認しています…"
  });
  const databaseSummary = element("dl", { className: "auth-preview-summary" });
  const databaseSection = element("section", { className: "auth-preview-database stack" }, [
    element("h2", { text: "DBアクセス確認" }),
    databaseStatus,
    databaseSummary
  ]);
  const logout = element("button", {
    className: "button button-danger button-block",
    type: "button",
    text: "検証セッションからログアウト",
    onClick: async () => {
      logout.disabled = true;
      const { error } = await client.auth.signOut();
      if (error) {
        announce("ログアウトに失敗しました。");
        logout.disabled = false;
      }
    }
  });

  clear(app);
  app.append(element("main", { className: "auth-layout" },
    element("section", { className: "card auth-card stack" }, [
      element("div", {}, [
        element("h1", { text: "ログイン成功" }),
        element("p", { className: "group-name", text: CONFIG.GROUP_NAME })
      ]),
      element("p", {
        className: "auth-preview-success",
        text: "Supabase Authのセッションがこのブラウザに保存されました。"
      }),
      element("dl", { className: "auth-preview-summary" }, [
        element("div", {}, [element("dt", { text: "メール" }), element("dd", { text: snapshot.email || "なし" })]),
        element("div", {}, [element("dt", { text: "ユーザーUUID" }), element("dd", { text: snapshot.id || "なし" })]),
        element("div", {}, [element("dt", { text: "最終ログイン" }), element("dd", { text: snapshot.last_sign_in_at || "なし" })])
      ]),
      element("details", { className: "auth-preview-details" }, [
        element("summary", { text: "Supabaseから返されたユーザー情報を確認" }),
        element("p", {
          className: "muted",
          text: "アクセストークンとリフレッシュトークンは意図的に表示していません。"
        }),
        element("pre", { text: JSON.stringify(snapshot, null, 2) })
      ]),
      databaseSection,
      logout,
      element("a", { className: "auth-preview-back", href: "./", text: "現在のNKOへ戻る" })
    ])
  ));

  loadDatabaseAccess(client, { groupId: CONFIG.GROUP_ID, userId: user.id })
    .then(({ membership, currentMember, members }) => {
      clear(databaseSummary);
      if (!membership || !currentMember) {
        databaseStatus.className = "inline-error";
        databaseStatus.textContent = "このログインユーザーにはNKOの利用権限がありません。";
        return;
      }

      databaseStatus.className = "auth-preview-success";
      databaseStatus.textContent = "RLSを通してNKOデータを読み取れました。";
      databaseSummary.append(
        element("div", {}, [element("dt", { text: "メンバー" }), element("dd", { text: currentMember.name })]),
        element("div", {}, [element("dt", { text: "操作権限" }), element("dd", { text: roleLabel(membership.role) })]),
        element("div", {}, [
          element("dt", { text: "閲覧可能" }),
          element("dd", { text: members.map((member) => member.name).join("・") || "なし" })
        ])
      );
    })
    .catch((error) => {
      clear(databaseSummary);
      databaseStatus.className = "inline-error";
      databaseStatus.textContent = `DBアクセス確認に失敗しました。(${error?.code || "unknown"})`;
    });
}

async function start() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_PUBLISHABLE_KEY || !window.supabase?.createClient) {
    renderUnavailable();
    return;
  }

  const client = getSupabaseClient();

  const { data, error } = await client.auth.getSession();
  if (error) {
    await client.auth.signOut({ scope: "local" });
    renderSignedOut(client);
  } else if (data.session?.user) {
    renderSignedIn(client, data.session.user);
  } else {
    renderSignedOut(client);
  }

  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) renderSignedIn(client, session.user);
    else renderSignedOut(client);
  });
}

start();
