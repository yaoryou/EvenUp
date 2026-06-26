export function getStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The app remains usable for the current session.
  }
}

export function removeStored(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing else to do.
  }
}
