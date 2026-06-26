import { announce, element } from "../utils/dom.js";

let timer;

export function showToast(message) {
  clearTimeout(timer);
  document.querySelector(".toast")?.remove();
  const toast = element("div", { className: "toast", role: "status", text: message });
  document.body.append(toast);
  announce(message);
  timer = setTimeout(() => toast.remove(), 3500);
}
