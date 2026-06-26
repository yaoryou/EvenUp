export function element(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);

  for (const [key, value] of Object.entries(options)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== false && value != null) {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }

  for (const child of Array.isArray(children) ? children : [children]) {
    if (child != null) node.append(child);
  }

  return node;
}

export function clear(node) {
  node.replaceChildren();
}

export function announce(message) {
  const region = document.querySelector("#live-region");
  if (region) region.textContent = message;
}
