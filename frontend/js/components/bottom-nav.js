import { navigate } from "../app/router.js";
import { element } from "../utils/dom.js";

const items = [
  ["record", "記録"],
  ["settlement", "精算"],
  ["history", "履歴"]
];

export function createBottomNav(activeRoute) {
  return element(
    "nav",
    { className: "bottom-nav", "aria-label": "メインナビゲーション" },
    items.map(([route, label]) =>
      element("button", {
        className: "nav-button",
        type: "button",
        text: label,
        "aria-current": route === activeRoute ? "page" : null,
        onClick: () => navigate(route)
      })
    )
  );
}
