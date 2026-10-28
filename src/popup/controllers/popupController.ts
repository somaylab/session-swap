import {
  IPC_ACTIONS,
  IpcMessage,
  IpcResponse,
  PopupState,
  SessionProfile,
  StorageSchema,
} from "@shared/types";
import {
  extractDomainFromUrl,
  formatRelativeTime,
} from "@shared/utils";

// Harmonious, distinct avatar palette for clean monograms
const AVATAR_PALETTE = [
  { bg: "#1E3A8A", text: "#93C5FD" }, // Blue
  { bg: "#064E3B", text: "#6EE7B7" }, // Emerald
  { bg: "#4C1D95", text: "#C4B5FD" }, // Violet
  { bg: "#831843", text: "#F9A8D4" }, // Pink
  { bg: "#78350F", text: "#FCD34D" }, // Amber
  { bg: "#134E4A", text: "#5EEAD4" }, // Teal
  { bg: "#1F2937", text: "#E5E7EB" }, // Slate
];

function getAvatarColor(name: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
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
      await this.initTheme();
      this.setupGlobalEvents();
      await this.refreshState();
    } catch (err) {
      this.showToast(`Error initializing: ${(err as Error).message}`);
    }
  }

  private async initTheme(): Promise<void> {
    const raw = await chrome.storage.local.get(["ss_theme"]);
    if (raw.ss_theme) {
      this.currentTheme = raw.ss_theme === "light" ? "light" : "dark";
    } else {
      const isSystemLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      this.currentTheme = isSystemLight ? "light" : "dark";
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
      if (sun) sun.style.display = "block";
      if (moon) moon.style.display = "none";
    } else {
      if (sun) sun.style.display = "none";
      if (moon) moon.style.display = "block";
    }
    chrome.storage.local.set({ ss_theme: theme });
  }

  private toggleTheme(): void {
    const next = this.currentTheme === "light" ? "dark" : "light";
    this.applyTheme(next);
  }

  private async sendMessage<T>(message: IpcMessage): Promise<T> {
    return new Promise((resolve, reject) => {
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
  }

  private async refreshState(): Promise<void> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0 || !tabs[0].url) {
      this.renderUnsupportedHost("No active tab found");
      return;
    }

    const currentTab = tabs[0];
    const domain = currentTab.url ? extractDomainFromUrl(currentTab.url) : "";
    this.state.currentTabId = currentTab.id || -1;
    this.state.currentDomain = domain;

    const domainEl = document.getElementById("activeDomainDisplay");
    if (domainEl) domainEl.textContent = domain || "Unsupported page";

    const scopeDomainEl = document.getElementById("exportScopeDomain");
    if (scopeDomainEl) scopeDomainEl.textContent = domain || "Active domain";

    if (!domain) {
      this.renderUnsupportedHost("This page cannot be managed (internal or local page).");
      return;
    }

    // Enable action buttons
    (document.getElementById("saveSessionBtn") as HTMLButtonElement).disabled = false;
    (document.getElementById("newBlankBtn") as HTMLButtonElement).disabled = false;

    const data = await this.sendMessage<PopupState>({
      action: IPC_ACTIONS.GET_CURRENT_STATE,
      domain,
      tabId: this.state.currentTabId,
    });

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
    if (dot) dot.className = "status-indicator";

    const saveBtn = document.getElementById("saveSessionBtn") as HTMLButtonElement;
    const blankBtn = document.getElementById("newBlankBtn") as HTMLButtonElement;
    if (saveBtn) saveBtn.disabled = true;
    if (blankBtn) blankBtn.disabled = true;

    const container = document.getElementById("profileListContainer");
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon-wrap">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
          </div>
          <h3 class="empty-title">Cannot Manage This Page</h3>
          <p class="empty-subtitle">${this.escapeHtml(reason)} Chrome system URLs and local files do not support cookie/storage isolation.</p>
        </div>
      `;
    }
  }

  private updateStatusIndicator(): void {
    const dot = document.getElementById("statusDot");
    const hasActive = !!this.state.activeSessionId;
    if (dot) {
      dot.className = `status-indicator ${hasActive ? "active" : ""}`;
    }
  }

  private renderTagChips(): void {
    const row = document.getElementById("tagChipsRow");
    if (!row) return;

    const uniqueTags = new Set<string>();
    this.state.sessions.forEach((s) => {
      if (s.tag && s.tag.trim()) uniqueTags.add(s.tag.trim());
    });

    row.innerHTML = `<button class="filter-pill ${this.activeTagFilter === "ALL" ? "active" : ""}" data-tag="ALL">All Sessions</button>`;

    uniqueTags.forEach((tag) => {
      const isActive = this.activeTagFilter.toLowerCase() === tag.toLowerCase();
      const chip = document.createElement("button");
      chip.className = `filter-pill ${isActive ? "active" : ""}`;
      chip.dataset.tag = tag;
      chip.textContent = tag;
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
    if (!container) return;

    const filtered = this.getFilteredSessions();
    if (countEl) {
      const count = this.state.sessions.length;
      countEl.textContent = `${count} ${count === 1 ? "session" : "sessions"} on ${this.state.currentDomain || "active domain"}`;
    }

    if (filtered.length === 0) {
      if (this.searchQuery || this.activeTagFilter !== "ALL") {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon-wrap">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </div>
            <h3 class="empty-title">No matching sessions</h3>
            <p class="empty-subtitle">No sessions match "${this.escapeHtml(this.searchQuery || this.activeTagFilter)}".</p>
            <button id="resetSearchBtn" class="btn-outline" style="height:32px; font-size:12.5px;">Clear Filter</button>
          </div>
        `;
        document.getElementById("resetSearchBtn")?.addEventListener("click", () => {
          this.searchQuery = "";
          this.activeTagFilter = "ALL";
          const input = document.getElementById("searchInput") as HTMLInputElement;
          if (input) input.value = "";
          const clearBtn = document.getElementById("clearSearchBtn");
          if (clearBtn) clearBtn.style.display = "none";
          this.renderTagChips();
          this.renderProfileList();
        });
      } else {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon-wrap">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="3"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <h3 class="empty-title">No saved sessions yet</h3>
            <p class="empty-subtitle">Save your current login session to switch between multiple accounts easily.</p>
            <button id="emptySaveBtn" class="primary-action-btn" style="width: auto; padding: 0 20px; height: 38px;">
              + Save Current Session
            </button>
          </div>
        `;
        document.getElementById("emptySaveBtn")?.addEventListener("click", () => {
          this.openSaveModal();
        });
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
    card.className = "session-card";
    card.dataset.id = session.id;

    const isActive = session.id === this.state.activeSessionId;
    if (isActive) {
      card.classList.add("active-card");
    }

    const avatar = getAvatarColor(session.name);
    const initial = (session.name.charAt(0) || "S").toUpperCase();
    const cookieCount = session.cookies?.length || 0;
    const localCount = session.storage?.localStorage ? Object.keys(session.storage.localStorage).length : 0;
    const sessionCount = session.storage?.sessionStorage ? Object.keys(session.storage.sessionStorage).length : 0;
    const storageCount = localCount + sessionCount;
    const timeText = formatRelativeTime(session.lastUsed);

    card.innerHTML = `
      <div class="card-left">
        <div class="avatar-badge" style="background-color: ${avatar.bg}; color: ${avatar.text};">
          ${this.escapeHtml(initial)}
        </div>
        <div class="card-info">
          <div class="card-heading-row">
            <span class="card-name" title="${this.escapeHtml(session.name)}">${this.escapeHtml(session.name)}</span>
            ${session.tag ? `<span class="card-tag">${this.escapeHtml(session.tag)}</span>` : ""}
            ${isActive ? `<span class="active-pill">● ACTIVE</span>` : ""}
          </div>
          <div class="card-metadata">
            <span>Saved ${timeText} · ${cookieCount} cookies · ${storageCount} storages</span>
          </div>
        </div>
      </div>

      <div class="card-actions">
        ${
          isActive
            ? `<div class="in-use-badge" title="This profile is currently active in your tab">✓ In Use</div>`
            : `<button class="switch-btn switch-action" title="Switch to this profile and reload tab">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="17 1 21 5 17 9"></polyline>
                  <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                  <polyline points="7 23 3 19 7 15"></polyline>
                  <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
                <span>Switch</span>
              </button>`
        }

        <button class="card-icon-btn edit-action" title="Edit session name and tag">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
          </svg>
        </button>

        <button class="card-icon-btn danger-btn delete-action" title="Delete session">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
    const input = document.getElementById("saveProfileName") as HTMLInputElement;
    const tag = document.getElementById("saveProfileTag") as HTMLInputElement;
    if (input) {
      input.value = `Profile ${this.state.sessions.length + 1}`;
    }
    if (tag) tag.value = "";

    document.getElementById("saveModal")?.classList.add("open");
    input?.focus();
    input?.select();
  }

  private async handleConfirmSave(): Promise<void> {
    const input = document.getElementById("saveProfileName") as HTMLInputElement;
    const tag = document.getElementById("saveProfileTag") as HTMLInputElement;
    const name = input?.value.trim() || "Unnamed session";
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
    const idInput = document.getElementById("editSessionId") as HTMLInputElement;
    const nameInput = document.getElementById("editProfileName") as HTMLInputElement;
    const tagInput = document.getElementById("editProfileTag") as HTMLInputElement;

    if (idInput) idInput.value = session.id;
    if (nameInput) nameInput.value = session.name;
    if (tagInput) tagInput.value = session.tag || "";

    document.getElementById("editModal")?.classList.add("open");
    nameInput?.focus();
    nameInput?.select();
  }

  private async handleConfirmEdit(): Promise<void> {
    const idInput = document.getElementById("editSessionId") as HTMLInputElement;
    const nameInput = document.getElementById("editProfileName") as HTMLInputElement;
    const tagInput = document.getElementById("editProfileTag") as HTMLInputElement;

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
      this.showToast(`Update error: ${(err as Error).message}`);
    }
  }

  // Delete Modal
  private openDeleteModal(session: SessionProfile): void {
    const idInput = document.getElementById("deleteSessionId") as HTMLInputElement;
    const msg = document.getElementById("deleteConfirmMessage");

    if (idInput) idInput.value = session.id;
    if (msg) msg.textContent = `Are you sure you want to delete "${session.name}"?`;

    document.getElementById("deleteModal")?.classList.add("open");
  }

  private async handleConfirmDelete(): Promise<void> {
    const idInput = document.getElementById("deleteSessionId") as HTMLInputElement;
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
      this.showToast(`Delete failed: ${(err as Error).message}`);
    }
  }

  // Unified Data Hub (Export & Import)
  private async openDataModal(): Promise<void> {
    document.getElementById("dataModal")?.classList.add("open");
    await this.updateExportJson();
  }

  private async updateExportJson(): Promise<void> {
    const radio = document.querySelector('input[name="exportScope"]:checked') as HTMLInputElement;
    const scope = radio ? radio.value : "domain";
    const textarea = document.getElementById("exportJsonArea") as HTMLTextAreaElement;

    let payload: unknown;
    if (scope === "domain") {
      payload = await this.sendMessage<SessionProfile[]>({
        action: IPC_ACTIONS.EXPORT_SESSIONS,
        domain: this.state.currentDomain,
      });
    } else {
      payload = await this.sendMessage<StorageSchema>({
        action: IPC_ACTIONS.BACKUP_ALL,
      });
    }

    if (textarea) textarea.value = JSON.stringify(payload, null, 2);
  }

  private async handleCopyExport(): Promise<void> {
    const textarea = document.getElementById("exportJsonArea") as HTMLTextAreaElement;
    if (!textarea || !textarea.value) return;

    await navigator.clipboard.writeText(textarea.value);
    const copyText = document.getElementById("copyBtnText");
    if (copyText) {
      copyText.textContent = "Copied to Clipboard!";
      setTimeout(() => {
        copyText.textContent = "Copy to Clipboard";
      }, 2000);
    }
    this.showToast("JSON payload copied to clipboard");
  }

  private handleDownloadExport(): void {
    const textarea = document.getElementById("exportJsonArea") as HTMLTextAreaElement;
    if (!textarea || !textarea.value) return;

    const radio = document.querySelector('input[name="exportScope"]:checked') as HTMLInputElement;
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

  private async handleExecuteImport(): Promise<void> {
    const textarea = document.getElementById("importJsonArea") as HTMLTextAreaElement;
    const raw = textarea?.value.trim();
    if (!raw) {
      this.showToast("Please paste JSON payload first");
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const res = await this.sendMessage<{ count: number }>({
          action: IPC_ACTIONS.IMPORT_SESSIONS,
          importedProfiles: parsed,
        });
        document.getElementById("dataModal")?.classList.remove("open");
        this.showToast(`Successfully imported ${res.count} profiles`);
        await this.refreshState();
        return;
      }

      if (parsed && typeof parsed === "object" && Array.isArray(parsed.sessions)) {
        const res = await this.sendMessage<{ restoredSessions: number; restoredDomains: number }>({
          action: IPC_ACTIONS.RESTORE_ALL,
          backupPayload: parsed,
          overwrite: false,
        });
        document.getElementById("dataModal")?.classList.remove("open");
        this.showToast(`Restored ${res.restoredSessions} sessions across all domains`);
        await this.refreshState();
        return;
      }

      throw new Error("Unrecognized session format. Expected SessionProfile[] or full backup schema.");
    } catch (err) {
      this.showToast(`Import error: ${(err as Error).message}`);
    }
  }

  // Setup Global Listeners
  private setupGlobalEvents(): void {
    // Theme toggle
    document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
      this.toggleTheme();
    });

    // Data Hub (Backup/Sync)
    document.getElementById("dataHubBtn")?.addEventListener("click", () => {
      this.openDataModal();
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
        const tagInput = document.getElementById("saveProfileTag") as HTMLInputElement;
        if (tag && tagInput) tagInput.value = tag;
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
    const searchInput = document.getElementById("searchInput") as HTMLInputElement;
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
      const pill = (e.target as HTMLElement).closest(".filter-pill") as HTMLElement;
      if (!pill) return;
      document.querySelectorAll(".filter-pill").forEach((c) => c.classList.remove("active"));
      pill.classList.add("active");
      this.activeTagFilter = pill.dataset.tag || "ALL";
      this.renderProfileList();
    });

    // Data Modal: Tabs
    const tabExport = document.getElementById("tabExportBtn");
    const tabImport = document.getElementById("tabImportBtn");
    const paneExport = document.getElementById("exportTabContent");
    const paneImport = document.getElementById("importTabContent");

    tabExport?.addEventListener("click", () => {
      tabExport.classList.add("active");
      tabImport?.classList.remove("active");
      paneExport?.classList.add("active");
      paneImport?.classList.remove("active");
      this.updateExportJson();
    });

    tabImport?.addEventListener("click", () => {
      tabImport.classList.add("active");
      tabExport?.classList.remove("active");
      paneImport?.classList.add("active");
      paneExport?.classList.remove("active");
    });

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

    // File Upload for Import
    const fileInput = document.getElementById("importFileInput") as HTMLInputElement;
    const chooseFileBtn = document.getElementById("chooseFileBtn");
    const fileStatus = document.getElementById("importFileStatus");

    chooseFileBtn?.addEventListener("click", () => {
      fileInput?.click();
    });

    fileInput?.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (fileStatus) fileStatus.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const area = document.getElementById("importJsonArea") as HTMLTextAreaElement;
          if (area) area.value = ev.target?.result as string;
        };
        reader.readAsText(file);
      }
    });

    document.getElementById("confirmImportBtn")?.addEventListener("click", () => {
      this.handleExecuteImport();
    });

    // Global Keydown shortcuts: Escape, '/'
    document.addEventListener("keydown", (e) => {
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
