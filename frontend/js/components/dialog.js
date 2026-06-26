import { element } from "../utils/dom.js";

export function showDialog({
  title,
  content,
  confirmLabel = "OK",
  danger = false,
  showCancel = true,
  onConfirm
}) {
  const root = document.querySelector("#overlay-root");
  const close = () => root.replaceChildren();
  const dialogError = element("p", { className: "inline-error", role: "alert" });
  const cancelButton = element("button", {
    className: "button button-secondary",
    type: "button",
    text: "戻る",
    onClick: close
  });
  const confirmButton = element("button", {
    className: `button ${danger ? "button-danger" : "button-primary"}`,
    type: "button",
    text: confirmLabel,
    onClick: async () => {
      dialogError.textContent = "";
      cancelButton.disabled = true;
      confirmButton.disabled = true;
      try {
        const shouldClose = await onConfirm?.();
        if (shouldClose !== false) close();
      } catch (error) {
        if (error?.message !== "validation") {
          dialogError.textContent = error?.message || "処理に失敗しました。";
        }
      } finally {
        cancelButton.disabled = false;
        confirmButton.disabled = false;
      }
    }
  });
  const panel = element("section", { className: "dialog", role: "dialog", "aria-modal": "true" }, [
    element("h2", { text: title }),
    content,
    dialogError,
    element("div", { className: "cluster" }, showCancel ? [cancelButton, confirmButton] : [confirmButton])
  ]);
  root.replaceChildren(element("div", { className: "dialog-backdrop", onClick: (event) => {
    if (event.target === event.currentTarget) close();
  } }, panel));
  panel.querySelector("button")?.focus();
}
