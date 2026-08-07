import { element } from "../utils/dom.js";
import { createBottomNav } from "./bottom-nav.js";
import { CONFIG } from "../config.js";

export function createAppShell(route, page, onSettings) {
  const header = element("header", { className: "app-header" }, [
    element("div", { className: "app-identity" }, [
      element("h1", { className: "app-title", text: CONFIG.APP_NAME }),
      element("span", { className: "app-group-name", text: CONFIG.GROUP_NAME })
    ]),
    element("button", {
      className: "button button-ghost",
      type: "button",
      text: "設定",
      onClick: onSettings
    })
  ]);

  return element("div", { className: "app-shell" }, [header, page, createBottomNav(route)]);
}
