// Browsers may clear a site's saved data when storage runs low (Safari also clears
// sites that are not opened for 7 days). Asking for persistent storage protects trips,
// documents and queued changes. Installed PWAs are usually granted it automatically.

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}
