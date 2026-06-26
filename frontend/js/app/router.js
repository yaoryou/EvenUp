const routes = new Set(["record", "settlement", "history"]);

export function currentRoute() {
  const route = location.hash.replace(/^#\//, "");
  return routes.has(route) ? route : "record";
}

export function navigate(route) {
  location.hash = `#/${routes.has(route) ? route : "record"}`;
}

export function startRouter(onRoute) {
  const update = () => onRoute(currentRoute());
  addEventListener("hashchange", update);
  if (!location.hash) navigate("record");
  else update();
}
