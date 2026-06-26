import { element } from "../utils/dom.js";
import { createBottomNav } from "./bottom-nav.js";

export function createAppShell(route, page, onSettings) {
  const header = element("header", { className: "app-header" }, [
    element("h1", { className: "app-title", text: "EvenUp" }),
    element("button", {
      className: "button button-ghost",
      type: "button",
      text: "設定",
      onClick: onSettings
    })
  ]);

  return element("div", { className: "app-shell" }, [header, page, createBottomNav(route)]);
}
