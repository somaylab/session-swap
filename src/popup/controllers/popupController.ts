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
  private currentTheme: "light" | "dark" = "light";

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
      this.currentTheme = raw.ss_theme === "dark" ? "dark" : "light";
    } else {
      const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      this.currentTheme = isSystemDark ? "dark" : "light";
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

    const saveScopeEl = document.getElementById("saveScopeDisplay");
    if (saveScopeEl) saveScopeEl.textContent = domain || "Active domain";

    if (!domain) {
      this.renderUnsupportedHost("This page cannot be managed (internal or local page).");
      return;
    }

    // Enable action buttons
    const saveBtn = document.getElementById("saveSessionBtn") as HTMLButtonElement | null;
    const blankBtn = document.getElementById("newBlankBtn") as HTMLButtonElement | null;
    if (saveBtn) saveBtn.disabled = false;
    if (blankBtn) blankBtn.disabled = false;

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
    if (!container) return;

    const filtered = this.getFilteredSessions();
    if (countEl) {
      const count = this.state.sessions.length;
      countEl.textContent = `${count} ${count === 1 ? "profile" : "profiles"} saved on this domain`;
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
            <h3 class="empty-title">No matching profiles</h3>
            <p class="empty-subtitle">No sessions match "${this.escapeHtml(this.searchQuery || this.activeTagFilter)}".</p>
            <button id="resetSearchBtn" class="btn-primary-save nb-btn" style="width: auto; padding: 6px 14px;">Clear Filter</button>
          </div>
        `;
        document.getElementById("resetSearchBtn")?.addEventListener("click", () => {
          this.searchQuery = "";
          this.activeTagFilter = "ALL";
          const input = document.getElementById("searchInput") as HTMLInputElement;
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <h3 class="empty-title">No saved sessions yet</h3>
            <p class="empty-subtitle">Save your current login session to switch between multiple accounts easily.</p>
            <button id="emptySaveBtn" class="btn-primary-save nb-btn" style="width: auto; padding: 6px 16px;">
              + Save Session
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

    const cookieCount = session.cookies?.length || 0;
    const localCount = session.storage?.localStorage ? Object.keys(session.storage.localStorage).length : 0;
    const sessionCount = session.storage?.sessionStorage ? Object.keys(session.storage.sessionStorage).length : 0;
    const storageCount = localCount + sessionCount;
    const timeText = formatRelativeTime(session.lastUsed);
    const tagStyle = session.tag ? getTagColor(session.tag) : null;
    const shortId = session.id.slice(0, 8);

    card.innerHTML = `
      <div class="card-top-row">
        <div class="card-title-group">
          <div class="card-indicator-dot"></div>
          <div class="card-main-info">
            <div class="card-heading-wrap">
              <span class="card-name" title="${this.escapeHtml(session.name)}">${this.escapeHtml(session.name)}</span>
              ${isActive ? `<span class="card-active-pill">ACTIVE</span>` : ""}
            </div>
            <p class="card-stats-text">
              <span>${cookieCount} cookies</span>
              <span>•</span>
              <span>${storageCount} storage keys</span>
            </p>
          </div>
        </div>

        <div class="card-actions-cluster">
          ${
            isActive
              ? `<button class="card-btn-action resync-action nb-btn-sm" title="Re-sync Snapshot">
                   <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"></path>
                   </svg>
                 </button>`
              : `<button class="switch-cta-btn switch-action nb-btn" title="Switch to this profile and reload tab">
                   <span>Switch</span>
                   <span>↵</span>
                 </button>`
          }

          <button class="card-btn-action copy-session-action nb-btn-sm" title="Copy Single Session JSON">
            <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="1" ry="1"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>

          <button class="card-btn-action edit-action nb-btn-sm" title="Edit name & tag">
            <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </button>

          <button class="card-btn-action delete-action nb-btn-sm" title="Delete session">
            <svg class="w-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="card-bottom-row">
        <div class="card-meta-left">
          ${
            session.tag && tagStyle
              ? `<span class="card-tag-pill" style="background:${tagStyle.bg}; color:${tagStyle.text};">#${this.escapeHtml(session.tag)}</span>`
              : ""
          }
          <span class="card-time-text">${isActive ? "Updated" : "Synced"} ${timeText}</span>
        </div>
        <span class="card-id-text">ID: ${shortId}</span>
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

    if (scope) scope.textContent = this.state.currentDomain || "Active domain";
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
      this.showToast(`Delete failed: ${(err as Error).message}`);
    }
  }

  // Unified Data Hub (Export & Import)
  private async openDataModal(): Promise<void> {
    document.getElementById("dataModal")?.classList.add("open");
    await this.updateExportJson();
  }

  private async updateExportJson(): Promise<void> {
    const radio = document.querySelector('input[name="exportScope"]:checked') as HTMLInputElement | null;
    const scope = radio ? radio.value : "domain";
    const textarea = document.getElementById("exportJsonArea") as HTMLTextAreaElement | null;
    const sizeBadge = document.getElementById("exportSizeBadge");

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

    const formatted = JSON.stringify(payload, null, 2);
    if (textarea) textarea.value = formatted;

    if (sizeBadge) {
      const bytes = new Blob([formatted]).size;
      const sizeText = bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
      sizeBadge.textContent = sizeText;
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

  private async handleExecuteImport(): Promise<void> {
    const textarea = document.getElementById("importJsonArea") as HTMLTextAreaElement | null;
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

      if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).sessions)) {
        const res = await this.sendMessage<{ restoredSessions: number; restoredDomains: number }>({
          action: IPC_ACTIONS.RESTORE_ALL,
          backupPayload: parsed as StorageSchema,
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

    // Quick Export from footer
    document.getElementById("quickExportBtn")?.addEventListener("click", () => {
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
        const tagInput = document.getElementById("saveProfileTag") as HTMLInputElement | null;
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
    const fileInput = document.getElementById("importFileInput") as HTMLInputElement | null;
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
          const area = document.getElementById("importJsonArea") as HTMLTextAreaElement | null;
          if (area) area.value = ev.target?.result as string;
        };
        reader.readAsText(file);
      }
    });

    document.getElementById("confirmImportBtn")?.addEventListener("click", () => {
      this.handleExecuteImport();
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
