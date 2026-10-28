import { StorageSnapshot } from "@shared/types";

// Injected into DOM of target tab
function domExtractStorage(): StorageSnapshot {
  const local: Record<string, string> = {};
  const session: Record<string, string> = {};

  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key !== null) {
        const val = window.localStorage.getItem(key);
        if (val !== null) local[key] = val;
      }
    }
  } catch (e) {
    console.warn("[session-swap] Error accessing localStorage:", e);
  }

  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key !== null) {
        const val = window.sessionStorage.getItem(key);
        if (val !== null) session[key] = val;
      }
    }
  } catch (e) {
    console.warn("[session-swap] Error accessing sessionStorage:", e);
  }

  return { localStorage: local, sessionStorage: session };
}

// Injected into DOM to apply snapshot
function domInjectStorage(localData: Record<string, string>, sessionData: Record<string, string>): boolean {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();

    for (const [k, v] of Object.entries(localData)) {
      window.localStorage.setItem(k, v);
    }
    for (const [k, v] of Object.entries(sessionData)) {
      window.sessionStorage.setItem(k, v);
    }
    return true;
  } catch (e) {
    console.error("[session-swap] Error injecting storage:", e);
    return false;
  }
}

// Injected into DOM to wipe storage
function domClearStorage(): boolean {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
    return true;
  } catch (e) {
    console.error("[session-swap] Error wiping storage:", e);
    return false;
  }
}

export class StorageEngine {
  /**
   * Extracts localStorage and sessionStorage snapshots from the given tab.
   */
  async captureStorageForTab(tabId: number): Promise<StorageSnapshot> {
    if (!tabId || tabId <= 0) {
      return { localStorage: {}, sessionStorage: {} };
    }
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: domExtractStorage,
      });

      return results?.[0]?.result || { localStorage: {}, sessionStorage: {} };
    } catch (err) {
      console.warn(`[StorageEngine] Failed to capture tab ${tabId} storage:`, err);
      return { localStorage: {}, sessionStorage: {} };
    }
  }

  /**
   * Injects localStorage and sessionStorage snapshots into the given tab.
   */
  async restoreStorageForTab(tabId: number, snapshot: StorageSnapshot): Promise<void> {
    if (!tabId || tabId <= 0) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: domInjectStorage,
        args: [snapshot.localStorage, snapshot.sessionStorage],
      });
    } catch (err) {
      console.warn(`[StorageEngine] Failed to restore tab ${tabId} storage:`, err);
    }
  }

  /**
   * Completely clears web storage for the given tab.
   */
  async clearStorageForTab(tabId: number): Promise<void> {
    if (!tabId || tabId <= 0) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: domClearStorage,
      });
    } catch (err) {
      console.warn(`[StorageEngine] Failed to clear tab ${tabId} storage:`, err);
    }
  }
}
