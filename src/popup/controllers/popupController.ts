import {
  ActiveSessionsMap,
  IPC_ACTIONS,
  IpcMessage,
  IpcResponse,
  PopupState,
  RestoreResult,
  SessionProfile,
  StorageSchema,
  SystemBackupSnapshotV2,
} from "@shared/types";
import {
  extractDomainFromUrl,
  formatRelativeTime,
} from "@shared/utils";

// Distinct pastel color cycle for tag badges matching DevPop Brutal
const TAG_PASTEL_COLORS = [
  { bg: "var(--pastel-lavender)", text: "var(--text-ink)" },
  { bg: "var(--pastel-periwinkle)", text: "var(--text-ink)" },
  { bg: "var(--pastel-peach)", text: "var(--text-ink)" },
  { bg: "var(--pastel-yellow)", text: "var(--text-ink)" },
  { bg: "var(--pastel-mint)", text: "var(--text-ink)" },
  { bg: "var(--pastel-coral)", text: "var(--text-ink)" },
];

function getTagColor(tag: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i);
    hash |= 0;
  }
  return TAG_PASTEL_COLORS[Math.abs(hash) % TAG_PASTEL_COLORS.length];
}

export class PopupController {
  private state: PopupState = {
    currentDomain: "",
    currentTabId: -1,
    sessions: [],
    activeSessionId: null,
  };

  private activeTagFilter = "ALL";
  private searchQuery = "";
  private currentTheme: "light" | "dark" = "dark";

  async init(): Promise<void> {
    try {
      this.initFooterVersion();
      await this.initTheme();
    } catch {}

    try {
      this.setupGlobalEvents();
    } catch {}

    try {
      await this.refreshState();
    } catch (err) {
      this.showToast(`Error initializing: ${(err as Error).message}`);
    }
  }

  private initFooterVersion(): void {
    const versionEl = document.getElementById("footerVersionTag");
    if (versionEl) {
      try {
        const manifestVer = chrome.runtime?.getManifest?.()?.version;
        if (manifestVer) {
          versionEl.textContent = manifestVer;
        }
      } catch {
        // Fallback to static text in markup
      }
    }
  }

  private async initTheme(): Promise<void> {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const raw = await chrome.storage.local.get(["ss_theme"]);
        if (raw.ss_theme) {
          this.currentTheme = raw.ss_theme === "light" ? "light" : "dark";
        } else {
          const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          this.currentTheme = isSystemDark ? "dark" : "light";
        }
      } else {
        const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        this.currentTheme = isSystemDark ? "dark" : "light";
      }
    } catch {
      this.currentTheme = "dark";
    }
    this.applyTheme(this.currentTheme);
  }

  private applyTheme(theme: "light" | "dark"): void {
    this.currentTheme = theme;
    document.body.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);

    const sun = document.getElementById("themeIconSun");
    const moon = document.getElementById("themeIconMoon");
    if (theme === "light") {
      if (sun) sun.style.display = "none";
      if (moon) moon.style.display = "block";
    } else {
      if (sun) sun.style.display = "block";
      if (moon) moon.style.display = "none";
    }
    chrome.storage.local.set({ ss_theme: theme });
  }

  private toggleTheme(): void {
    const next = this.currentTheme === "light" ? "dark" : "light";
    this.applyTheme(next);
  }

  private async sendMessage<T>(message: IpcMessage, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        return await new Promise<T>((resolve, reject) => {
          chrome.runtime.sendMessage(message, (response: IpcResponse<T>) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response || !response.success) {
              reject(new Error(response?.error || "Unknown IPC error"));
            } else {
              resolve(response.data as T);
            }
          });
        });
      } catch (err) {
        const msg = (err as Error).message || "";
        const isTransient =
          msg.includes("Could not establish connection") ||
          msg.includes("Receiving end does not exist") ||
          msg.includes("message port closed");

        if (isTransient && attempt < maxRetries) {
          // Service worker is waking up from idle, wait with exponential backoff
          await new Promise((res) => setTimeout(res, attempt * 120));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Unable to establish IPC connection with background service worker");
  }

  private async getLocalStateFallback(domain: string, tabId: number): Promise<PopupState> {
    try {
      const raw = await chrome.storage.local.get(["ss_sessions", "ss_active_map"]);
      const allSessions: SessionProfile[] = Array.isArray(raw.ss_sessions) ? raw.ss_sessions : [];
      const activeMap: ActiveSessionsMap =
        raw.ss_active_map && typeof raw.ss_active_map === "object" ? raw.ss_active_map : {};

      const domainSessions = allSessions
        .filter((s) => s.domain === domain)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const activeId = activeMap[domain] || null;

      return {
        currentDomain: domain,
        currentTabId: tabId,
        sessions: domainSessions,
        activeSessionId: activeId,
      };
    } catch (err) {
      console.error("[PopupController] Local state fallback error:", err);
      return {
        currentDomain: domain,
        currentTabId: tabId,
        sessions: [],
        activeSessionId: null,
      };
    }
  }

  private async refreshState(): Promise<void> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0 || !tabs[0].url) {
      this.renderUnsupportedHost("NO ACTIVE TAB");
      return;
    }

    const currentTab = tabs[0];
    const domain = currentTab.url ? extractDomainFromUrl(currentTab.url) : "";
    this.state.currentTabId = currentTab.id || -1;
    this.state.currentDomain = domain;

    const domainEl = document.getElementById("activeDomainDisplay");
    if (domainEl) domainEl.textContent = domain ? domain.toUpperCase() : "UNSUPPORTED PAGE";

    const scopeDomainEl = document.getElementById("exportScopeDomain");
    if (scopeDomainEl) scopeDomainEl.textContent = domain || "active domain";

    const saveScopeEl = document.getElementById("saveScopeDisplay");
    if (saveScopeEl) saveScopeEl.textContent = domain || "active domain";

    if (!domain) {
      this.renderUnsupportedHost("THIS PAGE CANNOT BE MANAGED (SYSTEM OR LOCAL PAGE).");
      return;
    }

    // Enable action buttons
    const saveBtn = document.getElementById("saveSessionBtn") as HTMLButtonElement | null;
    const blankBtn = document.getElementById("newBlankBtn") as HTMLButtonElement | null;
    if (saveBtn) saveBtn.disabled = false;
    if (blankBtn) blankBtn.disabled = false;

    let data: PopupState;
    try {
      data = await this.sendMessage<PopupState>({
        action: IPC_ACTIONS.GET_CURRENT_STATE,
        domain,
        tabId: this.state.currentTabId,
      });
    } catch (ipcErr) {
      console.warn("[PopupController] Background service worker unavailable/waking, reading local store directly:", ipcErr);
      data = await this.getLocalStateFallback(domain, this.state.currentTabId);
    }

    this.state.sessions = data.sessions || [];
    this.state.activeSessionId = data.activeSessionId || null;

    this.updateStatusIndicator();
    this.renderTagChips();
    this.renderProfileList();
  }

  private renderUnsupportedHost(reason: string): void {
    const domainEl = document.getElementById("activeDomainDisplay");
    if (domainEl) domainEl.textContent = reason;

    const dot = document.getElementById("statusDot");
    if (dot) dot.className = "status-dot";

    const saveBtn = document.getElementById("saveSessionBtn") as HTMLButtonElement | null;
    const blankBtn = document.getElementById("newBlankBtn") as HTMLButtonElement | null;
    if (saveBtn) saveBtn.disabled = true;
    if (blankBtn) blankBtn.disabled = true;

    const container = document.getElementById("profileListContainer");
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
          </div>
          <h3 class="empty-title">CANNOT MANAGE THIS PAGE</h3>
          <p class="empty-subtitle">${this.escapeHtml(reason)} Chrome system URLs and local files do not support cookie/storage isolation.</p>
        </div>
      `;
    }
  }

  private updateStatusIndicator(): void {
    const dot = document.getElementById("statusDot");
    const hasActive = !!this.state.activeSessionId;
    if (dot) {
      dot.className = `status-dot ${hasActive ? "active" : ""}`;
    }
  }

  private renderTagChips(): void {
    const row = document.getElementById("tagChipsRow");
    if (!row) return;

    const uniqueTags = new Map<string, number>();
    this.state.sessions.forEach((s) => {
      if (s.tag && s.tag.trim()) {
        const t = s.tag.trim();
        uniqueTags.set(t, (uniqueTags.get(t) || 0) + 1);
      }
    });

    const totalCount = this.state.sessions.length;
    row.innerHTML = `
      <button class="chip-pill ${this.activeTagFilter === "ALL" ? "active" : ""} nb-btn-sm" data-tag="ALL">
        <span>All</span>
        <span class="chip-count" id="chipCountAll">${totalCount}</span>
      </button>
    `;

    uniqueTags.forEach((count, tag) => {
      const isActive = this.activeTagFilter.toLowerCase() === tag.toLowerCase();
      const chip = document.createElement("button");
      chip.className = `chip-pill ${isActive ? "active" : ""} nb-btn-sm`;
      chip.dataset.tag = tag;
      chip.innerHTML = `<span>${this.escapeHtml(tag)}</span><span class="chip-count">${count}</span>`;
      row.appendChild(chip);
    });
  }

  private getFilteredSessions(): SessionProfile[] {
    let list = this.state.sessions;

    if (this.activeTagFilter !== "ALL") {
      list = list.filter((s) => (s.tag || "").toLowerCase() === this.activeTagFilter.toLowerCase());
    }

    if (this.searchQuery) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(this.searchQuery) ||
          (s.tag && s.tag.toLowerCase().includes(this.searchQuery))
      );
    }

    return list;
  }

  private renderProfileList(): void {
    const container = document.getElementById("profileListContainer");
    const countEl = document.getElementById("profileCountText");
    const entriesCountEl = document.getElementById("entriesCountText");
    if (!container) return;

    const filtered = this.getFilteredSessions();
    const count = this.state.sessions.length;

    if (countEl) {
      countEl.textContent = `${count} ${count === 1 ? "PROFILE ACTIVE" : "PROFILES ACTIVE"}`;
    }
    if (entriesCountEl) {
      entriesCountEl.textContent = `${count} ${count === 1 ? "PROFILE" : "PROFILES"}`;
    }

    if (filtered.length === 0) {
      if (this.searchQuery || this.activeTagFilter !== "ALL") {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </svg>
            </div>
            <h3 class="empty-title">NO MATCHING PROFILES</h3>
            <p class="empty-subtitle">No sessions match "${this.escapeHtml(this.searchQuery || this.activeTagFilter)}".</p>
            <button id="resetSearchBtn" class="tb-btn tb-btn-save nb-btn" style="width: auto; padding: 6px 14px;">CLEAR FILTER</button>
          </div>
        `;
        document.getElementById("resetSearchBtn")?.addEventListener("click", () => {
          this.searchQuery = "";
          this.activeTagFilter = "ALL";
          const input = document.getElementById("searchInput") as HTMLInputElement | null;
          if (input) input.value = "";
          const clearBtn = document.getElementById("clearSearchBtn");
          if (clearBtn) clearBtn.style.display = "none";
          const searchKbd = document.getElementById("searchKbd");
          if (searchKbd) searchKbd.style.display = "block";
          this.renderTagChips();
          this.renderProfileList();
        });
      } else {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon-wrap">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <h3 class="empty-title">NO SAVED SESSIONS YET</h3>
            <p class="empty-subtitle">Save your current login session to switch between multiple accounts easily.</p>
          </div>
        `;
      }
      return;
    }

    container.innerHTML = "";
    filtered.forEach((session) => {
      const card = this.createProfileCard(session);
      container.appendChild(card);
    });
  }

  private createProfileCard(session: SessionProfile): HTMLElement {
    const card = document.createElement("div");
    card.className = "session-row-card";
    card.dataset.id = session.id;

    const isActive = session.id === this.state.activeSessionId;
    if (isActive) {
      card.classList.add("active-card");
    }

    const cookieCount = session.cookies?.length || 0;
    const localCount = session.storage?.localStorage ? Object.keys(session.storage.localStorage).length : 0;
    const sessionCount = session.storage?.sessionStorage ? Object.keys(session.storage.sessionStorage).length : 0;
    const storageCount = localCount + sessionCount;
    const timeText = formatRelativeTime(session.lastUsed);
    const tagStyle = session.tag ? getTagColor(session.tag) : null;
    const domainText = session.domain || this.state.currentDomain || "";

    card.innerHTML = `
      <div class="col-status">
        <span class="row-dot"></span>
      </div>

      <div class="col-name" title="${this.escapeHtml(session.name)}">
        <span>${this.escapeHtml(session.name)}</span>
        ${isActive ? `<span class="row-badge-active">ACTIVE</span>` : ""}
      </div>

      <div class="col-tag">
        ${
          session.tag && tagStyle
            ? `<span class="tag-badge" style="background:${tagStyle.bg}; color:${tagStyle.text};">#${this.escapeHtml(session.tag)}</span>`
            : `<span style="opacity:0.35;">—</span>`
        }
      </div>

      <div class="col-domain" title="${this.escapeHtml(domainText)}">
        <span>.${this.escapeHtml(domainText.replace(/^www\./i, ""))}</span>
      </div>

      <div class="col-payload">
        <span class="payload-chip">${cookieCount}C</span>
        <span class="payload-chip">${storageCount}S</span>
      </div>

      <div class="col-synced">
        <span>${timeText}</span>
      </div>

      <div class="col-actions">
        ${
          isActive
            ? `<button class="row-icon-action resync-action nb-btn-sm" title="Re-sync Current Tab State into Snapshot">
                 <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                   <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"></path>
                 </svg>
               </button>`
            : `<button class="row-btn-switch switch-action nb-btn" title="Switch to this profile and reload tab">
                 <span>SWITCH</span>
                 <span>↵</span>
               </button>`
        }

        <button class="row-icon-action copy-session-action nb-btn-sm" title="Copy Single Session JSON">
          <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="1" ry="1"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>

        <button class="row-icon-action edit-action nb-btn-sm" title="Edit name & tag">
          <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
          </svg>
        </button>

        <button class="row-icon-action delete-action nb-btn-sm" title="Delete session">
          <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    // Switch action
    card.querySelector(".switch-action")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.handleSwitchSession(session);
    });

    // Re-sync action
    card.querySelector(".resync-action")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.handleResyncSession(session);
    });

    // Copy single session action
    card.querySelector(".copy-session-action")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.handleCopySingleSession(session);
    });

    // Edit action
    card.querySelector(".edit-action")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openEditModal(session);
    });

    // Delete action
    card.querySelector(".delete-action")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openDeleteModal(session);
    });

    return card;
  }

  private async handleSwitchSession(session: SessionProfile): Promise<void> {
    try {
      this.showToast(`Restoring "${session.name}"...`);
      await this.sendMessage({
        action: IPC_ACTIONS.APPLY_SESSION,
        sessionId: session.id,
        tabId: this.state.currentTabId,
      });
      await this.refreshState();
    } catch (err) {
      this.showToast(`Failed: ${(err as Error).message}`);
    }
  }

  private async handleResyncSession(session: SessionProfile): Promise<void> {
    try {
      this.showToast(`Re-syncing "${session.name}"...`);
      await this.sendMessage({
        action: IPC_ACTIONS.SAVE_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTabId,
        name: session.name,
        tag: session.tag,
      });
      this.showToast(`Snapshot "${session.name}" re-synced!`);
      await this.refreshState();
    } catch (err) {
      this.showToast(`Re-sync failed: ${(err as Error).message}`);
    }
  }

  private async handleCopySingleSession(session: SessionProfile): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(session, null, 2));
      this.showToast(`Copied "${session.name}" JSON to clipboard!`);
    } catch (err) {
      this.showToast(`Copy failed: ${(err as Error).message}`);
    }
  }

  private async handleNewBlank(): Promise<void> {
    try {
      this.showToast("Cleared active session state");
      await this.sendMessage({
        action: IPC_ACTIONS.CLEAR_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTabId,
      });
      await this.refreshState();
    } catch (err) {
      this.showToast(`Failed: ${(err as Error).message}`);
    }
  }

  // Save Modal
  private openSaveModal(): void {
    const input = document.getElementById("saveProfileName") as HTMLInputElement | null;
    const tag = document.getElementById("saveProfileTag") as HTMLInputElement | null;
    const scope = document.getElementById("saveScopeDisplay");

    if (scope) scope.textContent = this.state.currentDomain || "active domain";
    if (input) {
      input.value = `Profile ${this.state.sessions.length + 1}`;
    }
    if (tag) tag.value = "";

    document.getElementById("saveModal")?.classList.add("open");
    input?.focus();
    input?.select();
  }

  private async handleConfirmSave(): Promise<void> {
    const input = document.getElementById("saveProfileName") as HTMLInputElement | null;
    const tag = document.getElementById("saveProfileTag") as HTMLInputElement | null;
    const name = input?.value.trim() || `Profile ${this.state.sessions.length + 1}`;
    const tagVal = tag?.value.trim();

    try {
      document.getElementById("saveModal")?.classList.remove("open");
      await this.sendMessage({
        action: IPC_ACTIONS.SAVE_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTabId,
        name,
        tag: tagVal || undefined,
      });
      this.showToast("Session snapshot saved!");
      await this.refreshState();
    } catch (err) {
      this.showToast(`Save failed: ${(err as Error).message}`);
    }
  }

  // Edit Modal
  private openEditModal(session: SessionProfile): void {
    const idInput = document.getElementById("editSessionId") as HTMLInputElement | null;
    const nameInput = document.getElementById("editProfileName") as HTMLInputElement | null;
    const tagInput = document.getElementById("editProfileTag") as HTMLInputElement | null;

    if (idInput) idInput.value = session.id;
    if (nameInput) nameInput.value = session.name;
    if (tagInput) tagInput.value = session.tag || "";

    document.getElementById("editModal")?.classList.add("open");
    nameInput?.focus();
    nameInput?.select();
  }

  private async handleConfirmEdit(): Promise<void> {
    const idInput = document.getElementById("editSessionId") as HTMLInputElement | null;
    const nameInput = document.getElementById("editProfileName") as HTMLInputElement | null;
    const tagInput = document.getElementById("editProfileTag") as HTMLInputElement | null;

    const id = idInput?.value;
    const newName = nameInput?.value.trim();
    const tag = tagInput?.value.trim();

    if (!id || !newName) return;

    try {
      document.getElementById("editModal")?.classList.remove("open");
      await this.sendMessage({
        action: IPC_ACTIONS.RENAME_SESSION,
        sessionId: id,
        newName,
        tag: tag || undefined,
      });
      this.showToast("Profile updated");
      await this.refreshState();
    } catch (err) {
      try {
        const raw = await chrome.storage.local.get(["ss_sessions"]);
        const sessions: SessionProfile[] = Array.isArray(raw.ss_sessions) ? raw.ss_sessions : [];
        const match = sessions.find((s) => s.id === id);
        if (match) {
          match.name = newName;
          if (tag) match.tag = tag;
          await chrome.storage.local.set({ ss_sessions: sessions });
          this.showToast("Profile updated");
          await this.refreshState();
          return;
        }
      } catch {}
      this.showToast(`Update error: ${(err as Error).message}`);
    }
  }

  // Delete Modal
  private openDeleteModal(session: SessionProfile): void {
    const idInput = document.getElementById("deleteSessionId") as HTMLInputElement | null;
    const msg = document.getElementById("deleteConfirmMessage");

    if (idInput) idInput.value = session.id;
    if (msg) msg.textContent = `Are you sure you want to delete "${session.name}"?`;

    document.getElementById("deleteModal")?.classList.add("open");
  }

  private async handleConfirmDelete(): Promise<void> {
    const idInput = document.getElementById("deleteSessionId") as HTMLInputElement | null;
    const id = idInput?.value;
    if (!id) return;

    try {
      document.getElementById("deleteModal")?.classList.remove("open");
      await this.sendMessage({
        action: IPC_ACTIONS.DELETE_SESSION,
        sessionId: id,
      });
      this.showToast("Session profile removed");
      await this.refreshState();
    } catch (err) {
      try {
        const raw = await chrome.storage.local.get(["ss_sessions", "ss_active_map"]);
        let sessions: SessionProfile[] = Array.isArray(raw.ss_sessions) ? raw.ss_sessions : [];
        const match = sessions.find((s) => s.id === id);
        sessions = sessions.filter((s) => s.id !== id);
        const activeMap: ActiveSessionsMap = raw.ss_active_map || {};
        if (match && activeMap[match.domain] === id) {
          delete activeMap[match.domain];
        }
        await chrome.storage.local.set({ ss_sessions: sessions, ss_active_map: activeMap });
        this.showToast("Session profile removed");
        await this.refreshState();
        return;
      } catch {}
      this.showToast(`Delete failed: ${(err as Error).message}`);
    }
  }

  // Unified Data Hub (Export, Import & 1:1 Backup/Restore)
  private async openDataModal(defaultTab: "export" | "import" | "backup" = "export"): Promise<void> {
    document.getElementById("dataModal")?.classList.add("open");
    if (defaultTab === "export") {
      document.getElementById("tabExportBtn")?.click();
    } else if (defaultTab === "import") {
      document.getElementById("tabImportBtn")?.click();
    } else if (defaultTab === "backup") {
      document.getElementById("tabBackupBtn")?.click();
    }
  }

  private async updateExportJson(): Promise<void> {
    const radio = document.querySelector('input[name="exportScope"]:checked') as HTMLInputElement | null;
    const scope = radio ? radio.value : "domain";
    const textarea = document.getElementById("exportJsonArea") as HTMLTextAreaElement | null;
    const sizeBadge = document.getElementById("exportSizeBadge");

    let payload: unknown;
    if (scope === "domain") {
      try {
        payload = await this.sendMessage<SessionProfile[]>({
          action: IPC_ACTIONS.EXPORT_SESSIONS,
          domain: this.state.currentDomain,
        });
      } catch {
        const raw = await chrome.storage.local.get(["ss_sessions"]);
        const sessions: SessionProfile[] = Array.isArray(raw.ss_sessions) ? raw.ss_sessions : [];
        payload = sessions.filter((s) => s.domain === this.state.currentDomain);
      }
    } else {
      try {
        payload = await this.sendMessage<SessionProfile[]>({
          action: IPC_ACTIONS.EXPORT_SESSIONS,
        });
      } catch {
        const raw = await chrome.storage.local.get(["ss_sessions"]);
        payload = Array.isArray(raw.ss_sessions) ? raw.ss_sessions : [];
      }
    }

    const formatted = JSON.stringify(payload, null, 2);
    if (textarea) textarea.value = formatted;

    if (sizeBadge) {
      const bytes = new Blob([formatted]).size;
      const sizeText = bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
      sizeBadge.textContent = sizeText;
    }
  }

  // --- 1:1 System Backup & Restore Methods ---
  private async updateBackupTabStats(): Promise<void> {
    try {
      const raw = await chrome.storage.local.get(["ss_sessions", "ss_active_map", "ss_theme"]);
      const sessions: SessionProfile[] = Array.isArray(raw.ss_sessions) ? raw.ss_sessions : [];
      const activeMap = raw.ss_active_map || {};
      const domains = new Set(sessions.map((s) => s.domain));
      const theme = (raw.ss_theme === "light" ? "LIGHT" : "DARK");

      const sElem = document.getElementById("backupStatSessions");
      const dElem = document.getElementById("backupStatDomains");
      const aElem = document.getElementById("backupStatActive");
      const tElem = document.getElementById("backupStatTheme");

      if (sElem) sElem.textContent = String(sessions.length);
      if (dElem) dElem.textContent = String(domains.size);
      if (aElem) aElem.textContent = String(Object.keys(activeMap).length);
      if (tElem) tElem.textContent = theme;
    } catch {
      // ignore
    }
  }

  private async handleCopyBackup(): Promise<void> {
    try {
      const payload = await this.sendMessage<SystemBackupSnapshotV2>({
        action: IPC_ACTIONS.BACKUP_ALL,
      });
      const formatted = JSON.stringify(payload, null, 2);
      await navigator.clipboard.writeText(formatted);
      const copyText = document.getElementById("copyBackupBtnText");
      if (copyText) {
        const orig = copyText.textContent;
        copyText.textContent = "COPIED! ✓";
        setTimeout(() => {
          copyText.textContent = orig || "Copy Backup JSON";
        }, 1800);
      }
      this.showToast("1:1 Full System Backup copied to clipboard");
    } catch (err) {
      this.showToast(`Backup error: ${(err as Error).message}`);
    }
  }

  private async handleDownloadBackup(): Promise<void> {
    try {
      const payload = await this.sendMessage<SystemBackupSnapshotV2>({
        action: IPC_ACTIONS.BACKUP_ALL,
      });
      const formatted = JSON.stringify(payload, null, 2);
      const blob = new Blob([formatted], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `session-swap-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast("1:1 Backup snapshot downloaded");
    } catch (err) {
      this.showToast(`Download error: ${(err as Error).message}`);
    }
  }

  private updateRestoreValidationUi(): void {
    const area = document.getElementById("restoreJsonArea") as HTMLTextAreaElement | null;
    const statusContainer = document.getElementById("restoreValidationStatus");
    const statusText = document.getElementById("restoreValidationStatusText");
    const statusPill = document.getElementById("restoreStatusPill");
    if (!area || !statusContainer) return;

    const val = area.value.trim();
    if (!val) {
      if (statusText) statusText.textContent = "Upload backup file or paste snapshot JSON below";
      if (statusPill) statusPill.textContent = "WAITING";
      statusContainer.classList.remove("valid", "error");
      return;
    }

    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).sessions)) {
        const p = parsed as any;
        const count = p.sessions.length;
        const domCount = new Set(p.sessions.map((s: any) => s.domain)).size;
        const theme = p.system?.theme ? `Theme: ${String(p.system.theme).toUpperCase()}` : "Config: Default";
        const fmt = p.format === "session-swap-system-backup" ? "v2.0 Snapshot" : "Backup Envelope";

        if (statusText) statusText.textContent = `✓ Valid ${fmt}: ${count} profile(s), ${domCount} domain(s), ${theme}`;
        if (statusPill) statusPill.textContent = "VALID";
        statusContainer.classList.add("valid");
        statusContainer.classList.remove("error");
        return;
      }

      if (statusText) statusText.textContent = "⚠ Invalid backup: Missing 'sessions' array envelope";
      if (statusPill) statusPill.textContent = "ERROR";
      statusContainer.classList.add("error");
      statusContainer.classList.remove("valid");
    } catch (err) {
      if (statusText) statusText.textContent = `✕ Invalid JSON: ${(err as Error).message}`;
      if (statusPill) statusPill.textContent = "ERROR";
      statusContainer.classList.add("error");
      statusContainer.classList.remove("valid");
    }
  }

  private async handleExecuteRestore(): Promise<void> {
    const textarea = document.getElementById("restoreJsonArea") as HTMLTextAreaElement | null;
    const raw = textarea?.value.trim();
    if (!raw) {
      this.showToast("Please upload a backup file or paste snapshot JSON first");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.showToast(`Invalid JSON: ${(err as Error).message}`);
      return;
    }

    const confirmed = window.confirm(
      "Apakah Bos yakin ingin merestore database 1:1?\n\nSemua sesi profil, kategori, sesi aktif, dan konfigurasi tema saat ini akan digantikan secara penuh sesuai snapshot backup."
    );
    if (!confirmed) return;

    try {
      const res = await this.sendMessage<RestoreResult>({
        action: IPC_ACTIONS.RESTORE_ALL,
        backupPayload: parsed,
      });

      if (res.restoredTheme) {
        this.applyTheme(res.restoredTheme);
      }

      document.getElementById("dataModal")?.classList.remove("open");
      this.showToast(`✓ Database 1:1 restored! ${res.restoredSessions} profiles across ${res.restoredDomains} domains`);
      await this.refreshState();
    } catch (err) {
      this.showToast(`Restore error: ${(err as Error).message}`);
    }
  }

  private async handleCopyExport(): Promise<void> {
    const textarea = document.getElementById("exportJsonArea") as HTMLTextAreaElement | null;
    if (!textarea || !textarea.value) return;

    await navigator.clipboard.writeText(textarea.value);
    const copyText = document.getElementById("copyBtnText");
    if (copyText) {
      const orig = copyText.textContent;
      copyText.textContent = "COPIED! ✓";
      setTimeout(() => {
        copyText.textContent = orig || "Copy JSON";
      }, 1800);
    }
    this.showToast("JSON payload copied to clipboard");
  }

  private handleDownloadExport(): void {
    const textarea = document.getElementById("exportJsonArea") as HTMLTextAreaElement | null;
    if (!textarea || !textarea.value) return;

    const radio = document.querySelector('input[name="exportScope"]:checked') as HTMLInputElement | null;
    const scope = radio ? radio.value : "domain";

    const blob = new Blob([textarea.value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-swap-${scope === "domain" ? this.state.currentDomain : "backup"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("Export file downloaded");
  }

  private validateImportPayload(raw: string): { valid: boolean; summary: string } {
    if (!raw.trim()) {
      return { valid: false, summary: "Paste JSON or select a file to inspect payload" };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).sessions)) {
        const count = (parsed as { sessions: unknown[] }).sessions.length;
        return { valid: true, summary: `✓ Full Backup Archive detected (${count} profile${count === 1 ? "" : "s"})` };
      }
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) {
          return { valid: false, summary: "⚠ JSON array is empty" };
        }
        if (parsed[0] && typeof parsed[0] === "object" && "cookies" in parsed[0]) {
          return { valid: true, summary: `✓ Profiles Array detected (${parsed.length} profile${parsed.length === 1 ? "" : "s"})` };
        }
        if (parsed[0] && typeof parsed[0] === "object" && "name" in parsed[0] && "value" in parsed[0]) {
          return { valid: true, summary: `✓ Raw Cookie List detected (${parsed.length} cookies, Cookie-Editor format)` };
        }
        return { valid: true, summary: `✓ Generic Object Array detected (${parsed.length} item${parsed.length === 1 ? "" : "s"})` };
      }
      if (parsed && typeof parsed === "object") {
        if ("cookies" in parsed || "name" in parsed) {
          const name = (parsed as { name?: string }).name || "Unnamed Snapshot";
          return { valid: true, summary: `✓ Single Profile detected: "${name}"` };
        }
      }
      return { valid: false, summary: "⚠ Unrecognized JSON structure for session import" };
    } catch (e) {
      return { valid: false, summary: `✕ Invalid JSON: ${(e as Error).message}` };
    }
  }

  private updateImportValidationUi(): void {
    const area = document.getElementById("importJsonArea") as HTMLTextAreaElement | null;
    const statusContainer = document.getElementById("importValidationStatus");
    const statusText = document.getElementById("importValidationStatusText");
    const statusPill = document.getElementById("importStatusPill");
    if (!area || !statusContainer) return;

    const val = area.value;
    if (!val.trim()) {
      if (statusText) statusText.textContent = "Paste JSON or select a file to inspect payload";
      if (statusPill) statusPill.textContent = "WAITING";
      statusContainer.classList.remove("valid", "error");
      return;
    }

    const { valid, summary } = this.validateImportPayload(val);
    if (statusText) statusText.textContent = summary;
    if (valid) {
      statusContainer.classList.add("valid");
      statusContainer.classList.remove("error");
      if (statusPill) statusPill.textContent = "VALID";
    } else {
      statusContainer.classList.add("error");
      statusContainer.classList.remove("valid");
      if (statusPill) statusPill.textContent = "ERROR";
    }
  }

  private async handleExecuteImport(): Promise<void> {
    const textarea = document.getElementById("importJsonArea") as HTMLTextAreaElement | null;
    const raw = textarea?.value.trim();
    if (!raw) {
      this.showToast("Please paste JSON payload first");
      return;
    }

    const overwriteRadio = document.getElementById("importModeOverwriteRadio") as HTMLInputElement | null;
    const overwrite = Boolean(overwriteRadio?.checked);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.showToast(`Invalid JSON: ${(err as Error).message}`);
      return;
    }

    try {
      const res = await this.sendMessage<{ count: number; updated: number; domains: string[] }>({
        action: IPC_ACTIONS.IMPORT_SESSIONS,
        importedProfiles: parsed,
        fallbackDomain: this.state.currentDomain,
        overwrite,
      });

      document.getElementById("dataModal")?.classList.remove("open");
      const total = (res.count || 0) + (res.updated || 0);
      const details = res.updated > 0 ? ` (${res.updated} updated)` : "";
      this.showToast(`Imported ${total} profile(s)${details} across ${res.domains?.length || 1} domain(s)`);
      await this.refreshState();
    } catch (err) {
      // Resilient fallback to direct chrome.storage.local if SW is cold
      try {
        const rawStore = await chrome.storage.local.get(["ss_sessions"]);
        const sessions: SessionProfile[] = Array.isArray(rawStore.ss_sessions) ? rawStore.ss_sessions : [];
        let added = 0;
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.cookies) {
              sessions.push({
                id: item.id || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                name: item.name || `Imported ${sessions.length + 1}`,
                domain: item.domain || this.state.currentDomain,
                cookies: item.cookies || [],
                storage: item.storage || { localStorage: {}, sessionStorage: {} },
                createdAt: item.createdAt || Date.now(),
                lastUsed: item.lastUsed || Date.now(),
                order: sessions.length,
                tag: item.tag,
              });
              added++;
            }
          }
        }
        if (added > 0) {
          await chrome.storage.local.set({ ss_sessions: sessions });
          document.getElementById("dataModal")?.classList.remove("open");
          this.showToast(`Imported ${added} profile(s) via local storage`);
          await this.refreshState();
          return;
        }
      } catch {}
      this.showToast(`Import error: ${(err as Error).message}`);
    }
  }

  // Setup Global Listeners
  private setupGlobalEvents(): void {
    // Theme toggle
    document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
      this.toggleTheme();
    });

    // Refresh state button
    document.getElementById("refreshTabBtn")?.addEventListener("click", () => {
      this.refreshState();
      this.showToast("State refreshed");
    });

    // Data Hub (Backup/Sync)
    document.getElementById("dataHubBtn")?.addEventListener("click", () => {
      this.openDataModal();
    });

    // Quick Export from toolbar
    document.getElementById("quickExportBtn")?.addEventListener("click", () => {
      this.openDataModal("export");
    });

    // Quick Import from toolbar
    document.getElementById("quickImportBtn")?.addEventListener("click", () => {
      this.openDataModal("import");
    });

    // Quick Backup from toolbar
    document.getElementById("quickBackupBtn")?.addEventListener("click", () => {
      this.openDataModal("backup");
    });

    // Save & Blank buttons
    document.getElementById("saveSessionBtn")?.addEventListener("click", () => {
      this.openSaveModal();
    });
    document.getElementById("newBlankBtn")?.addEventListener("click", () => {
      this.handleNewBlank();
    });

    // Save dialog events
    document.getElementById("confirmSaveBtn")?.addEventListener("click", () => {
      this.handleConfirmSave();
    });
    document.querySelectorAll(".quick-tag-chip").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        const tag = (e.currentTarget as HTMLElement).dataset.applyTag;
        const tagInput = document.getElementById("saveProfileTag") as HTMLInputElement | null;
        if (tag && tagInput) tagInput.value = tag;
      });
    });

    // Capture scope items click
    ["optCookies", "optLocalStorage", "optSessionStorage", "optChips"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", (e) => {
        const el = e.currentTarget as HTMLElement;
        el.classList.toggle("selected");
        const count = document.querySelectorAll(".scope-select-item.selected").length;
        const badge = document.getElementById("captureScopeSummary");
        if (badge) badge.textContent = `${count} SELECTED`;
      });
    });

    // Edit dialog events
    document.getElementById("confirmEditBtn")?.addEventListener("click", () => {
      this.handleConfirmEdit();
    });

    // Delete dialog events
    document.getElementById("confirmDeleteBtn")?.addEventListener("click", () => {
      this.handleConfirmDelete();
    });

    // Modal close triggers
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.close;
        if (id) document.getElementById(id)?.classList.remove("open");
      });
    });

    // Search input
    const searchInput = document.getElementById("searchInput") as HTMLInputElement | null;
    const clearSearchBtn = document.getElementById("clearSearchBtn");
    const searchKbd = document.getElementById("searchKbd");

    searchInput?.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      if (clearSearchBtn) clearSearchBtn.style.display = this.searchQuery ? "block" : "none";
      if (searchKbd) searchKbd.style.display = this.searchQuery ? "none" : "block";
      this.renderProfileList();
    });

    clearSearchBtn?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      this.searchQuery = "";
      clearSearchBtn.style.display = "none";
      if (searchKbd) searchKbd.style.display = "block";
      this.renderProfileList();
    });

    // Tag chip clicks
    document.getElementById("tagChipsRow")?.addEventListener("click", (e) => {
      const pill = (e.target as HTMLElement).closest(".chip-pill") as HTMLElement | null;
      if (!pill) return;
      document.querySelectorAll(".chip-pill").forEach((c) => c.classList.remove("active"));
      pill.classList.add("active");
      this.activeTagFilter = pill.dataset.tag || "ALL";
      this.renderProfileList();
    });

    // Data Modal: 3 Dedicated Tabs
    const tabExport = document.getElementById("tabExportBtn");
    const tabImport = document.getElementById("tabImportBtn");
    const tabBackup = document.getElementById("tabBackupBtn");
    const paneExport = document.getElementById("exportTabContent");
    const paneImport = document.getElementById("importTabContent");
    const paneBackup = document.getElementById("backupTabContent");

    const switchDataTab = (target: "export" | "import" | "backup") => {
      tabExport?.classList.toggle("active", target === "export");
      tabImport?.classList.toggle("active", target === "import");
      tabBackup?.classList.toggle("active", target === "backup");

      paneExport?.classList.toggle("active", target === "export");
      paneImport?.classList.toggle("active", target === "import");
      paneBackup?.classList.toggle("active", target === "backup");

      if (target === "export") this.updateExportJson();
      if (target === "import") this.updateImportValidationUi();
      if (target === "backup") this.updateBackupTabStats();
    };

    tabExport?.addEventListener("click", () => switchDataTab("export"));
    tabImport?.addEventListener("click", () => switchDataTab("import"));
    tabBackup?.addEventListener("click", () => switchDataTab("backup"));

    // Scope Radio change
    document.querySelectorAll('input[name="exportScope"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        this.updateExportJson();
      });
    });

    // Copy & Download Export
    document.getElementById("copyJsonBtn")?.addEventListener("click", () => {
      this.handleCopyExport();
    });
    document.getElementById("downloadJsonBtn")?.addEventListener("click", () => {
      this.handleDownloadExport();
    });

    // Import Toolbar & Action Buttons
    const fileInput = document.getElementById("importFileInput") as HTMLInputElement | null;
    const chooseFileBtn = document.getElementById("chooseFileBtn");
    const fileStatus = document.getElementById("importFileStatus");

    chooseFileBtn?.addEventListener("click", () => {
      fileInput?.click();
    });

    // Paste from clipboard button
    document.getElementById("pasteClipboardBtn")?.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        const area = document.getElementById("importJsonArea") as HTMLTextAreaElement | null;
        if (area) {
          area.value = text;
          this.updateImportValidationUi();
        }
        this.showToast("Pasted payload from clipboard");
      } catch {
        this.showToast("Clipboard access denied. Press Ctrl+V inside box");
      }
    });

    // Clear import textarea
    document.getElementById("clearImportAreaBtn")?.addEventListener("click", () => {
      const area = document.getElementById("importJsonArea") as HTMLTextAreaElement | null;
      if (area) area.value = "";
      if (fileInput) fileInput.value = "";
      if (fileStatus) fileStatus.textContent = "";
      this.updateImportValidationUi();
      this.showToast("Cleared input area");
    });

    const importJsonArea = document.getElementById("importJsonArea") as HTMLTextAreaElement | null;
    importJsonArea?.addEventListener("input", () => {
      this.updateImportValidationUi();
    });

    fileInput?.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (fileStatus) fileStatus.textContent = `✓ ${file.name}`;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const area = document.getElementById("importJsonArea") as HTMLTextAreaElement | null;
          if (area) {
            area.value = ev.target?.result as string;
            this.updateImportValidationUi();
          }
        };
        reader.readAsText(file);
      }
    });

    document.getElementById("confirmImportBtn")?.addEventListener("click", () => {
      this.handleExecuteImport();
    });

    // --- Dedicated Backup & Restore Event Listeners ---
    document.getElementById("copyBackupBtn")?.addEventListener("click", () => {
      this.handleCopyBackup();
    });
    document.getElementById("downloadBackupBtn")?.addEventListener("click", () => {
      this.handleDownloadBackup();
    });

    const backupFileInput = document.getElementById("backupFileInput") as HTMLInputElement | null;
    const chooseBackupFileBtn = document.getElementById("chooseBackupFileBtn");
    const backupFileStatus = document.getElementById("backupFileStatus");
    const restoreJsonArea = document.getElementById("restoreJsonArea") as HTMLTextAreaElement | null;

    chooseBackupFileBtn?.addEventListener("click", () => {
      backupFileInput?.click();
    });

    backupFileInput?.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (backupFileStatus) backupFileStatus.textContent = `✓ ${file.name}`;
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (restoreJsonArea) {
            restoreJsonArea.value = ev.target?.result as string;
            this.updateRestoreValidationUi();
          }
        };
        reader.readAsText(file);
      }
    });

    document.getElementById("pasteBackupClipboardBtn")?.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (restoreJsonArea) {
          restoreJsonArea.value = text;
          this.updateRestoreValidationUi();
        }
        this.showToast("Pasted snapshot from clipboard");
      } catch {
        this.showToast("Clipboard access denied. Press Ctrl+V inside box");
      }
    });

    document.getElementById("clearBackupAreaBtn")?.addEventListener("click", () => {
      if (restoreJsonArea) restoreJsonArea.value = "";
      if (backupFileInput) backupFileInput.value = "";
      if (backupFileStatus) backupFileStatus.textContent = "";
      this.updateRestoreValidationUi();
      this.showToast("Cleared restore input area");
    });

    restoreJsonArea?.addEventListener("input", () => {
      this.updateRestoreValidationUi();
    });

    document.getElementById("confirmRestoreBtn")?.addEventListener("click", () => {
      this.handleExecuteRestore();
    });

    // Global Keydown shortcuts: Escape, '/', and Ctrl+S / Cmd+S
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        this.openSaveModal();
        return;
      }

      if (e.key === "/" && document.activeElement !== searchInput && !this.isAnyModalOpen()) {
        e.preventDefault();
        searchInput?.focus();
        return;
      }

      if (e.key === "Escape") {
        document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.remove("open"));
      }
    });
  }

  private isAnyModalOpen(): boolean {
    return document.querySelectorAll(".modal-backdrop.open").length > 0;
  }

  private showToast(msg: string): void {
    const toast = document.getElementById("toast");
    const text = document.getElementById("toastMessage");
    if (!toast || !text) return;

    text.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2400);
  }

  private escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
