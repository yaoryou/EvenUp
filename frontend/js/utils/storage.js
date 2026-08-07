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

export function migrateStoredKeys(keyPairs, storage = localStorage) {
  try {
    for (const [legacyKey, targetKey] of keyPairs) {
      const legacyValue = storage.getItem(legacyKey);
      if (legacyValue !== null && storage.getItem(targetKey) === null) {
        storage.setItem(targetKey, legacyValue);
      }
      if (legacyValue !== null) storage.removeItem(legacyKey);
    }
  } catch {
    // Migration is best-effort. Authentication can still be entered again.
  }
}
