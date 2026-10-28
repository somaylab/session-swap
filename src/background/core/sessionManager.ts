import { ActiveSessionsMap, CookieSnapshot, SessionProfile, StorageSchema } from "@shared/types";
import { extractDomainFromUrl, generateSessionId } from "@shared/utils";
import { CookieEngine } from "./cookieEngine";
import { StorageEngine } from "./storageEngine";

const STORAGE_KEYS = {
  SESSIONS: "ss_sessions",
  ACTIVE_MAP: "ss_active_map",
} as const;

function normalizeDomain(rawDomain: string): string {
  if (!rawDomain) return "";
  let clean = rawDomain.trim().toLowerCase();
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    clean = extractDomainFromUrl(clean);
  }
  if (clean.startsWith(".")) {
    clean = clean.slice(1);
  }
  if (clean.startsWith("www.")) {
    clean = clean.slice(4);
  }
  return clean.split(":")[0];
}

function sanitizeCookie(cookie: any, fallbackDomain: string): CookieSnapshot | null {
  if (!cookie || typeof cookie !== "object" || !cookie.name) return null;
  const name = String(cookie.name).trim();
  if (!name) return null;
  const value = String(cookie.value ?? "");
  let domain = String(cookie.domain || fallbackDomain || "").trim();
  if (domain.startsWith("http://") || domain.startsWith("https://")) {
    domain = extractDomainFromUrl(domain);
  }
  const path = String(cookie.path || "/").trim() || "/";
  const isHost = name.startsWith("__Host-");
  const isSecure = name.startsWith("__Secure-");
  const secure = isHost || isSecure || Boolean(cookie.secure);
  const httpOnly = Boolean(cookie.httpOnly);

  let sameSite: chrome.cookies.SameSiteStatus | undefined = undefined;
  if (cookie.sameSite) {
    const ss = String(cookie.sameSite).toLowerCase();
    if (ss === "no_restriction" || ss === "none") sameSite = "no_restriction";
    else if (ss === "lax") sameSite = "lax";
    else if (ss === "strict") sameSite = "strict";
    else sameSite = "unspecified";
  }

  let expirationDate: number | undefined = undefined;
  if (cookie.expirationDate && !cookie.session) {
    let exp = Number(cookie.expirationDate);
    if (exp > 1e11) exp = Math.floor(exp / 1000);
    if (!isNaN(exp) && exp > 0) expirationDate = exp;
  }

  return {
    name,
    value,
    domain,
    path: isHost ? "/" : path,
    secure,
    httpOnly,
    sameSite,
    expirationDate,
    partitionKey: cookie.partitionKey,
  };
}

export function parseAndNormalizeProfiles(
  rawInput: unknown,
  fallbackDomain: string = ""
): SessionProfile[] {
  let data: any = rawInput;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data.trim());
    } catch {
      return [];
    }
  }

  if (!data) return [];

  const rawList: any[] = [];

  // Case 1: Backup envelope or object with sessions array
  if (typeof data === "object" && !Array.isArray(data) && Array.isArray(data.sessions)) {
    rawList.push(...data.sessions);
  }
  // Case 2: Direct array
  else if (Array.isArray(data)) {
    // Check if it's an array of raw cookies (e.g. from Cookie-Editor / EditThisCookie)
    if (data.length > 0 && data[0] && data[0].name && !data[0].cookies && !data[0].storage) {
      const cookiesByDomain = new Map<string, any[]>();
      for (const c of data) {
        if (!c || !c.name) continue;
        const dom = normalizeDomain(c.domain) || normalizeDomain(fallbackDomain) || "imported-site.com";
        if (!cookiesByDomain.has(dom)) {
          cookiesByDomain.set(dom, []);
        }
        cookiesByDomain.get(dom)!.push(c);
      }

      for (const [dom, cList] of cookiesByDomain.entries()) {
        rawList.push({
          name: `Cookie-Editor (${dom})`,
          domain: dom,
          tag: "Imported",
          cookies: cList,
          storage: { localStorage: {}, sessionStorage: {} },
        });
      }
    } else {
      rawList.push(...data);
    }
  }
  // Case 3: Single SessionProfile object
  else if (typeof data === "object" && (data.cookies || data.domain || data.name)) {
    if (Array.isArray(data.cookies)) {
      rawList.push(data);
    }
  }

  const validatedProfiles: SessionProfile[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const dom = normalizeDomain(item.domain || fallbackDomain);
    if (!dom) continue;

    const name = String(item.name || "").trim() || `Profile ${validatedProfiles.length + 1}`;
    const rawCookies = Array.isArray(item.cookies) ? item.cookies : [];
    const sanitizedCookies: CookieSnapshot[] = rawCookies
      .map((c: any) => sanitizeCookie(c, dom))
      .filter((c: any): c is CookieSnapshot => c !== null);

    const storage = item.storage && typeof item.storage === "object"
      ? {
          localStorage: item.storage.localStorage && typeof item.storage.localStorage === "object" ? item.storage.localStorage : {},
          sessionStorage: item.storage.sessionStorage && typeof item.storage.sessionStorage === "object" ? item.storage.sessionStorage : {},
        }
      : { localStorage: {}, sessionStorage: {} };

    validatedProfiles.push({
      id: generateSessionId(),
      name,
      domain: dom,
      tag: String(item.tag || "Imported").trim() || "Imported",
      color: item.color,
      cookies: sanitizedCookies,
      storage,
      createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
      lastUsed: Date.now(),
      order: typeof item.order === "number" ? item.order : 0,
    });
  }

  return validatedProfiles;
}

export class SessionManager {
  private cookieEngine = new CookieEngine();
  private storageEngine = new StorageEngine();

  async getStorageData(): Promise<StorageSchema> {
    const raw = await chrome.storage.local.get([STORAGE_KEYS.SESSIONS, STORAGE_KEYS.ACTIVE_MAP]);
    const sessions = Array.isArray(raw[STORAGE_KEYS.SESSIONS])
      ? (raw[STORAGE_KEYS.SESSIONS] as SessionProfile[])
      : [];
    const activeSessions =
      raw[STORAGE_KEYS.ACTIVE_MAP] && typeof raw[STORAGE_KEYS.ACTIVE_MAP] === "object"
        ? (raw[STORAGE_KEYS.ACTIVE_MAP] as ActiveSessionsMap)
        : {};
    return { sessions, activeSessions };
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
    if (!domain) {
      throw new Error("Cannot save session: target domain is invalid");
    }
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
      const clean = normalizeDomain(domain);
      return store.sessions.filter((s) => s.domain === clean || s.domain === domain);
    }
    return store.sessions;
  }

  async backupAll(): Promise<StorageSchema & { exportedAt: number; version: string; app: string }> {
    const store = await this.getStorageData();
    return {
      app: "session-swap",
      version: "2.0.0",
      exportedAt: Date.now(),
      sessions: store.sessions,
      activeSessions: store.activeSessions,
    };
  }

  async restoreAll(
    backupPayload: unknown,
    overwrite: boolean = false
  ): Promise<{ restoredSessions: number; restoredDomains: number }> {
    const normalized = parseAndNormalizeProfiles(backupPayload);
    if (normalized.length === 0) {
      throw new Error("Backup payload contains no valid session profiles.");
    }

    const store = await this.getStorageData();
    let currentSessions = overwrite ? [] : [...store.sessions];
    let currentActive = overwrite ? {} : { ...store.activeSessions };
    const domainSet = new Set<string>();

    let count = 0;
    for (const profile of normalized) {
      domainSet.add(profile.domain);
      const existingIdx = currentSessions.findIndex(
        (s) => s.domain === profile.domain && s.name.toLowerCase() === profile.name.toLowerCase()
      );

      if (existingIdx !== -1 && overwrite) {
        currentSessions[existingIdx] = profile;
      } else {
        profile.order = currentSessions.filter((s) => s.domain === profile.domain).length;
        if (existingIdx !== -1 && !overwrite) {
          profile.name = `${profile.name} (Restored)`;
        }
        currentSessions.push(profile);
      }
      count++;
    }

    if (backupPayload && typeof backupPayload === "object" && (backupPayload as any).activeSessions) {
      const incomingActive = (backupPayload as any).activeSessions;
      Object.entries(incomingActive).forEach(([dom, _sid]) => {
        const cleanDom = normalizeDomain(dom);
        const match = currentSessions.find((s) => s.domain === cleanDom);
        if (match) {
          currentActive[cleanDom] = match.id;
        }
      });
    }

    await this.setStorageData({
      sessions: currentSessions,
      activeSessions: currentActive,
    });

    return { restoredSessions: count, restoredDomains: domainSet.size };
  }

  async importSessions(
    incomingPayload: unknown,
    fallbackDomain = "",
    overwrite = false
  ): Promise<{ count: number; updated: number; domains: string[] }> {
    const normalized = parseAndNormalizeProfiles(incomingPayload, fallbackDomain);
    if (normalized.length === 0) {
      throw new Error("No valid profiles or cookies detected in payload.");
    }

    const store = await this.getStorageData();
    let importedCount = 0;
    let updatedCount = 0;
    const domainSet = new Set<string>();

    for (const profile of normalized) {
      domainSet.add(profile.domain);
      const existingIdx = store.sessions.findIndex(
        (s) => s.domain === profile.domain && s.name.toLowerCase() === profile.name.toLowerCase()
      );

      if (existingIdx !== -1 && overwrite) {
        store.sessions[existingIdx].cookies = profile.cookies;
        store.sessions[existingIdx].storage = profile.storage;
        store.sessions[existingIdx].tag = profile.tag;
        store.sessions[existingIdx].lastUsed = Date.now();
        updatedCount++;
      } else {
        const domainCount = store.sessions.filter((s) => s.domain === profile.domain).length;
        profile.order = domainCount;
        if (existingIdx !== -1 && !overwrite) {
          profile.name = `${profile.name} (Imported)`;
        }
        store.sessions.push(profile);
        importedCount++;
      }
    }

    await this.setStorageData(store);
    return {
      count: importedCount,
      updated: updatedCount,
      domains: Array.from(domainSet),
    };
  }
}
