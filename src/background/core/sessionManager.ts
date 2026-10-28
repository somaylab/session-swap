import { ActiveSessionsMap, SessionProfile, StorageSchema } from "@shared/types";
import { generateSessionId } from "@shared/utils";
import { CookieEngine } from "./cookieEngine";
import { StorageEngine } from "./storageEngine";

const STORAGE_KEYS = {
  SESSIONS: "ss_sessions",
  ACTIVE_MAP: "ss_active_map",
} as const;

export class SessionManager {
  private cookieEngine = new CookieEngine();
  private storageEngine = new StorageEngine();

  async getStorageData(): Promise<StorageSchema> {
    const raw = await chrome.storage.local.get([STORAGE_KEYS.SESSIONS, STORAGE_KEYS.ACTIVE_MAP]);
    return {
      sessions: (raw[STORAGE_KEYS.SESSIONS] as SessionProfile[]) || [],
      activeSessions: (raw[STORAGE_KEYS.ACTIVE_MAP] as ActiveSessionsMap) || {},
    };
  }

  private async setStorageData(data: Partial<StorageSchema>): Promise<void> {
    const update: Record<string, unknown> = {};
    if (data.sessions !== undefined) {
      update[STORAGE_KEYS.SESSIONS] = data.sessions;
    }
    if (data.activeSessions !== undefined) {
      update[STORAGE_KEYS.ACTIVE_MAP] = data.activeSessions;
    }
    await chrome.storage.local.set(update);
  }

  async saveSession(
    domain: string,
    tabId: number,
    name: string,
    tag?: string
  ): Promise<SessionProfile> {
    const [cookies, storage] = await Promise.all([
      this.cookieEngine.captureCookiesForDomain(domain),
      this.storageEngine.captureStorageForTab(tabId),
    ]);

    const store = await this.getStorageData();
    const domainSessions = store.sessions.filter((s) => s.domain === domain);
    const maxOrder = domainSessions.length > 0 ? Math.max(...domainSessions.map((s) => s.order ?? 0)) : -1;

    const newProfile: SessionProfile = {
      id: generateSessionId(),
      name: name.trim() || "Unnamed Session",
      domain,
      tag: tag || "Default",
      cookies,
      storage,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      order: maxOrder + 1,
    };

    store.sessions.push(newProfile);
    store.activeSessions[domain] = newProfile.id;

    await this.setStorageData(store);
    return newProfile;
  }

  async applySession(sessionId: string, tabId: number): Promise<void> {
    const store = await this.getStorageData();
    const targetSession = store.sessions.find((s) => s.id === sessionId);

    if (!targetSession) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }

    const domain = targetSession.domain;

    // 1. Wipe current cookies and storage
    await this.cookieEngine.clearCookiesForDomain(domain);

    // 2. Restore cookies and storage
    await Promise.all([
      this.cookieEngine.restoreCookies(targetSession.cookies, domain),
      this.storageEngine.restoreStorageForTab(tabId, targetSession.storage),
    ]);

    // 3. Update state
    targetSession.lastUsed = Date.now();
    store.activeSessions[domain] = sessionId;
    await this.setStorageData(store);

    // 4. Force hard reload with cache bypass so Service Workers don't retain stale tokens
    try {
      await chrome.tabs.reload(tabId, { bypassCache: true });
    } catch {
      await chrome.tabs.reload(tabId);
    }
  }

  async clearCurrentSession(domain: string, tabId: number): Promise<void> {
    await Promise.all([
      this.cookieEngine.clearCookiesForDomain(domain),
      this.storageEngine.clearStorageForTab(tabId),
    ]);

    const store = await this.getStorageData();
    delete store.activeSessions[domain];
    await this.setStorageData(store);

    try {
      await chrome.tabs.reload(tabId, { bypassCache: true });
    } catch {
      await chrome.tabs.reload(tabId);
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const store = await this.getStorageData();
    const session = store.sessions.find((s) => s.id === sessionId);

    store.sessions = store.sessions.filter((s) => s.id !== sessionId);

    if (session && store.activeSessions[session.domain] === sessionId) {
      delete store.activeSessions[session.domain];
    }

    await this.setStorageData(store);
  }

  async renameSession(sessionId: string, newName: string, tag?: string): Promise<void> {
    const store = await this.getStorageData();
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    session.name = newName.trim() || session.name;
    if (tag) {
      session.tag = tag;
    }

    await this.setStorageData(store);
  }

  async reorderSessions(domain: string, orderedIds: string[]): Promise<void> {
    const store = await this.getStorageData();
    const domainSessions = store.sessions.filter((s) => s.domain === domain);

    orderedIds.forEach((id, idx) => {
      const match = domainSessions.find((s) => s.id === id);
      if (match) {
        match.order = idx;
      }
    });

    await this.setStorageData(store);
  }

  async exportSessions(domain?: string): Promise<SessionProfile[]> {
    const store = await this.getStorageData();
    if (domain) {
      return store.sessions.filter((s) => s.domain === domain);
    }
    return store.sessions;
  }

  async backupAll(): Promise<StorageSchema & { exportedAt: number; version: string }> {
    const store = await this.getStorageData();
    return {
      version: "1.1.0",
      exportedAt: Date.now(),
      sessions: store.sessions,
      activeSessions: store.activeSessions,
    };
  }

  async restoreAll(
    backupPayload: Partial<StorageSchema>,
    overwrite: boolean = false
  ): Promise<{ restoredSessions: number; restoredDomains: number }> {
    const incomingSessions = Array.isArray(backupPayload.sessions) ? backupPayload.sessions : [];
    const incomingActive = backupPayload.activeSessions || {};

    const store = await this.getStorageData();
    let currentSessions = overwrite ? [] : [...store.sessions];
    let currentActive = overwrite ? {} : { ...store.activeSessions };
    const domainSet = new Set<string>();

    let count = 0;
    for (const item of incomingSessions) {
      if (!item.name || !item.domain || !Array.isArray(item.cookies)) continue;

      const profile: SessionProfile = {
        ...item,
        id: generateSessionId(),
        createdAt: item.createdAt || Date.now(),
        lastUsed: Date.now(),
        order: currentSessions.filter((s) => s.domain === item.domain).length,
      };

      currentSessions.push(profile);
      domainSet.add(profile.domain);
      count++;
    }

    // Merge active map safely
    Object.entries(incomingActive).forEach(([dom, _sid]) => {
      // Find matching session in newly restored list
      const match = currentSessions.find((s) => s.domain === dom);
      if (match) {
        currentActive[dom] = match.id;
      }
    });

    await this.setStorageData({
      sessions: currentSessions,
      activeSessions: currentActive,
    });

    return { restoredSessions: count, restoredDomains: domainSet.size };
  }

  async importSessions(incoming: SessionProfile[]): Promise<number> {
    if (!Array.isArray(incoming)) {
      throw new Error("Invalid session backup format");
    }

    const store = await this.getStorageData();
    let importedCount = 0;

    for (const item of incoming) {
      if (!item.name || !item.domain || !Array.isArray(item.cookies)) {
        continue;
      }

      // Generate fresh ID to prevent collision
      const profile: SessionProfile = {
        ...item,
        id: generateSessionId(),
        order: (store.sessions.filter((s) => s.domain === item.domain).length) || 0,
        createdAt: item.createdAt || Date.now(),
        lastUsed: Date.now(),
      };

      store.sessions.push(profile);
      importedCount++;
    }

    await this.setStorageData(store);
    return importedCount;
  }
}
