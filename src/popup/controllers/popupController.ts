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

// Deterministic calm desaturated palette for profile avatars
const AVATAR_PALETTE = [
  { bg: "#2A364F", text: "#93C5FD" }, // Slate Blue
  { bg: "#2D3B36", text: "#86EFAC" }, // Sage Green
  { bg: "#3D314A", text: "#D8B4FE" }, // Muted Violet
  { bg: "#423235", text: "#FDA4AF" }, // Dusty Rose
  { bg: "#45382A", text: "#FDE047" }, // Warm Amber
  { bg: "#2B3B42", text: "#67E8F9" }, // Dusty Cyan
  { bg: "#353839", text: "#CBD5E1" }, // Neutral Slate
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
  private activeInlineAction: { type: "rename" | "delete"; sessionId: string } | null = null;
  private selectedRowIndex: number = -1;

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
      // Respect system preference
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

    if (!domain) {
      this.renderUnsupportedHost("This page cannot be managed (internal or local page).");
      return;
    }

    // Enable toolbar buttons
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
    const text = document.getElementById("statusText");
    if (dot) dot.className = "status-dot";
    if (text) text.textContent = "Unavailable";

    const saveBtn = document.getElementById("saveSessionBtn") as HTMLButtonElement;
    const blankBtn = document.getElementById("newBlankBtn") as HTMLButtonElement;
    if (saveBtn) saveBtn.disabled = true;
    if (blankBtn) blankBtn.disabled = true;

    const container = document.getElementById("profileListContainer");
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
          <div class="empty-title">This page cannot be managed</div>
          <div class="empty-desc">Chrome internal URLs and local filesystem pages do not permit extension storage isolation.</div>
        </div>
      `;
    }
  }

  private updateStatusIndicator(): void {
    const dot = document.getElementById("statusDot");
    const text = document.getElementById("statusText");
    const hasActive = !!this.state.activeSessionId;

    if (dot) dot.className = `status-dot ${hasActive ? "active" : ""}`;
    if (text) text.textContent = hasActive ? "Session active" : "No active session";
  }

  private renderTagChips(): void {
    const row = document.getElementById("tagChipsRow");
    if (!row) return;

    const uniqueTags = new Set<string>();
    this.state.sessions.forEach((s) => {
      if (s.tag && s.tag.trim()) uniqueTags.add(s.tag.trim());
    });

    row.innerHTML = `<button class="chip ${this.activeTagFilter === "ALL" ? "active" : ""}" data-tag="ALL">All</button>`;

    uniqueTags.forEach((tag) => {
      const isActive = this.activeTagFilter === tag;
      const chip = document.createElement("button");
      chip.className = `chip ${isActive ? "active" : ""}`;
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
      countEl.textContent = `${this.state.sessions.length} ${this.state.sessions.length === 1 ? "profile" : "profiles"}`;
    }

    if (filtered.length === 0) {
      if (this.searchQuery || this.activeTagFilter !== "ALL") {
        container.innerHTML = `
          <div class="empty-state">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <div class="empty-title">No matching profiles</div>
            <div class="empty-desc">No saved profiles match your filter "${this.escapeHtml(this.searchQuery || this.activeTagFilter)}".</div>
            <button id="clearSearchBtn" class="btn btn-ghost" style="height:28px;">Clear filter</button>
          </div>
        `;
        document.getElementById("clearSearchBtn")?.addEventListener("click", () => {
          this.searchQuery = "";
          this.activeTagFilter = "ALL";
          const input = document.getElementById("searchInput") as HTMLInputElement;
          if (input) input.value = "";
          this.renderTagChips();
          this.renderProfileList();
        });
      } else {
        container.innerHTML = `
          <div class="empty-state">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <div class="empty-title">No profiles for this domain yet</div>
            <div class="empty-desc">Save your current session to switch back to it later.</div>
            <button id="emptySaveBtn" class="btn btn-primary" style="height: 32px; padding: 0 16px;">Save current session</button>
          </div>
        `;
        document.getElementById("emptySaveBtn")?.addEventListener("click", () => {
          this.openSaveModal();
        });
      }
      return;
    }

    container.innerHTML = "";
    filtered.forEach((session, idx) => {
      const row = this.createProfileRow(session, idx);
      container.appendChild(row);
    });
  }

  private createProfileRow(session: SessionProfile, index: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "profile-row";
    row.setAttribute("role", "option");
    row.dataset.id = session.id;
    row.dataset.index = index.toString();

    const isActive = session.id === this.state.activeSessionId;
    if (isActive) {
      row.classList.add("active");
      row.setAttribute("aria-selected", "true");
    }

    // Check if row is currently in inline action state
    if (this.activeInlineAction?.sessionId === session.id) {
      if (this.activeInlineAction.type === "rename") {
        row.innerHTML = `
          <input type="text" class="inline-edit-input" value="${this.escapeHtml(session.name)}" />
          <div style="display:flex; gap:4px;">
            <button class="btn btn-primary btn-xs save-rename-btn">Save</button>
            <button class="btn btn-ghost btn-xs cancel-btn">Cancel</button>
          </div>
        `;
        const input = row.querySelector(".inline-edit-input") as HTMLInputElement;
        input?.focus();
        input?.select();

        const doSave = async () => {
          const val = input.value.trim();
          if (val) {
            await this.sendMessage({
              action: IPC_ACTIONS.RENAME_SESSION,
              sessionId: session.id,
              newName: val,
              tag: session.tag,
            });
            this.showToast("Profile renamed");
          }
          this.activeInlineAction = null;
          await this.refreshState();
        };

        row.querySelector(".save-rename-btn")?.addEventListener("click", (e) => {
          e.stopPropagation();
          doSave();
        });
        row.querySelector(".cancel-btn")?.addEventListener("click", (e) => {
          e.stopPropagation();
          this.activeInlineAction = null;
          this.renderProfileList();
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") doSave();
          if (e.key === "Escape") {
            this.activeInlineAction = null;
            this.renderProfileList();
          }
        });
        return row;
      }

      if (this.activeInlineAction.type === "delete") {
        row.innerHTML = `
          <div class="inline-confirm-box">
            <span class="inline-confirm-text">Delete '${this.escapeHtml(session.name)}'?</span>
            <div class="inline-confirm-btns">
              <button class="btn btn-ghost btn-xs cancel-btn">Cancel</button>
              <button class="btn btn-danger btn-xs confirm-delete-btn">Delete</button>
            </div>
          </div>
        `;
        row.querySelector(".confirm-delete-btn")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          await this.sendMessage({
            action: IPC_ACTIONS.DELETE_SESSION,
            sessionId: session.id,
          });
          this.activeInlineAction = null;
          this.showToast("Profile deleted");
          await this.refreshState();
        });
        row.querySelector(".cancel-btn")?.addEventListener("click", (e) => {
          e.stopPropagation();
          this.activeInlineAction = null;
          this.renderProfileList();
        });
        return row;
      }
    }

    // Default Normal Row
    const avatar = getAvatarColor(session.name);
    const initial = (session.name.charAt(0) || "P").toUpperCase();
    const cookieCount = session.cookies?.length || 0;
    const timeText = formatRelativeTime(session.lastUsed);

    row.innerHTML = `
      <div class="avatar" style="background-color: ${avatar.bg}; color: ${avatar.text};">
        ${this.escapeHtml(initial)}
      </div>

      <div class="profile-details">
        <div class="profile-line-1">
          <span class="profile-name" title="${this.escapeHtml(session.name)}">${this.escapeHtml(session.name)}</span>
          ${session.tag ? `<span class="profile-tag-pill">${this.escapeHtml(session.tag)}</span>` : ""}
        </div>
        <div class="profile-line-2">
          <span>Saved ${timeText} · ${cookieCount} cookies</span>
        </div>
      </div>

      <div class="row-actions">
        <button class="row-btn edit-btn" aria-label="Rename profile" title="Rename (F2)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        </button>
        <button class="row-btn delete-btn" aria-label="Delete profile" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    // Row Click = Switch session
    row.addEventListener("click", () => {
      this.handleSwitchSession(session);
    });

    // Rename Button Click
    row.querySelector(".edit-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.activeInlineAction = { type: "rename", sessionId: session.id };
      this.renderProfileList();
    });

    // Delete Button Click
    row.querySelector(".delete-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.activeInlineAction = { type: "delete", sessionId: session.id };
      this.renderProfileList();
    });

    return row;
  }

  private async handleSwitchSession(session: SessionProfile): Promise<void> {
    try {
      this.showToast(`Switched to "${session.name}"`);
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
      this.showToast("Cleared session state");
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
    const name = input?.value.trim() || "Unnamed profile";
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
      this.showToast("Session saved");
      await this.refreshState();
    } catch (err) {
      this.showToast(`Save failed: ${(err as Error).message}`);
    }
  }

  // Global listeners & keyboard navigation
  private setupGlobalEvents(): void {
    // Theme toggle
    document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
      this.toggleTheme();
    });

    // Overflow Menu Toggle
    const menuBtn = document.getElementById("overflowMenuBtn");
    const menu = document.getElementById("overflowMenu");
    menuBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = menu?.classList.contains("open");
      if (isOpen) {
        menu?.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
      } else {
        menu?.classList.add("open");
        menuBtn.setAttribute("aria-expanded", "true");
      }
    });

    document.addEventListener("click", () => {
      menu?.classList.remove("open");
      menuBtn?.setAttribute("aria-expanded", "false");
    });

    // Save & New blank
    document.getElementById("saveSessionBtn")?.addEventListener("click", () => {
      this.openSaveModal();
    });
    document.getElementById("newBlankBtn")?.addEventListener("click", () => {
      this.handleNewBlank();
    });
    document.getElementById("confirmSaveBtn")?.addEventListener("click", () => {
      this.handleConfirmSave();
    });

    // Modal close triggers
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.close;
        if (id) document.getElementById(id)?.classList.remove("open");
      });
    });

    // Search and '/' hotkey
    const searchInput = document.getElementById("searchInput") as HTMLInputElement;
    const searchKbd = document.getElementById("searchKbd");

    searchInput?.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      if (searchKbd) searchKbd.style.display = this.searchQuery ? "none" : "block";
      this.renderProfileList();
    });

    // Tag chip clicks
    document.getElementById("tagChipsRow")?.addEventListener("click", (e) => {
      const chip = (e.target as HTMLElement).closest(".chip") as HTMLElement;
      if (!chip) return;
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      this.activeTagFilter = chip.dataset.tag || "ALL";
      this.renderProfileList();
    });

    // Overflow Menu Item: Export profiles
    document.getElementById("menuItemExport")?.addEventListener("click", async () => {
      menu?.classList.remove("open");
      await this.openExportModal("domain");
    });

    // Overflow Menu Item: Full database backup
    document.getElementById("menuItemBackup")?.addEventListener("click", async () => {
      menu?.classList.remove("open");
      await this.openExportModal("all");
    });

    // Overflow Menu Item: Import profiles
    document.getElementById("menuItemImport")?.addEventListener("click", () => {
      menu?.classList.remove("open");
      this.openImportModal();
    });

    // Export Dialog Actions
    document.getElementById("copyExportBtn")?.addEventListener("click", () => {
      this.handleCopyExport();
    });
    document.getElementById("downloadExportBtn")?.addEventListener("click", () => {
      this.handleDownloadExport();
    });

    // Import Dialog Actions
    document.getElementById("uploadJsonBtn")?.addEventListener("click", () => {
      document.getElementById("importFileInput")?.click();
    });
    document.getElementById("importFileInput")?.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const txt = document.getElementById("importTextarea") as HTMLTextAreaElement;
          if (txt) txt.value = ev.target?.result as string;
        };
        reader.readAsText(file);
      }
    });
    document.getElementById("confirmImportBtn")?.addEventListener("click", () => {
      this.handleExecuteImport();
    });

    // Keyboard Shortcuts: '/', Escape, Enter
    document.addEventListener("keydown", (e) => {
      // Focus search on '/'
      if (e.key === "/" && document.activeElement !== searchInput && !this.isAnyModalOpen()) {
        e.preventDefault();
        searchInput?.focus();
        return;
      }

      // Close modals or inline actions on Escape
      if (e.key === "Escape") {
        menu?.classList.remove("open");
        document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.remove("open"));
        if (this.activeInlineAction) {
          this.activeInlineAction = null;
          this.renderProfileList();
        }
      }
    });
  }

  private isAnyModalOpen(): boolean {
    return document.querySelectorAll(".modal-overlay.open").length > 0;
  }

  // Export handlers
  private async openExportModal(scope: "domain" | "all"): Promise<void> {
    const title = document.getElementById("exportModalTitle");
    const textarea = document.getElementById("exportTextarea") as HTMLTextAreaElement;
    if (title) title.textContent = scope === "domain" ? "Export profiles" : "Full database backup";

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
    document.getElementById("exportModal")?.classList.add("open");
    textarea?.select();
  }

  private async handleCopyExport(): Promise<void> {
    const textarea = document.getElementById("exportTextarea") as HTMLTextAreaElement;
    if (!textarea || !textarea.value) return;

    await navigator.clipboard.writeText(textarea.value);
    const btn = document.getElementById("copyExportBtn");
    if (btn) {
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = "Copy to clipboard";
      }, 2000);
    }
    this.showToast("Copied to clipboard");
  }

  private handleDownloadExport(): void {
    const textarea = document.getElementById("exportTextarea") as HTMLTextAreaElement;
    if (!textarea || !textarea.value) return;

    const blob = new Blob([textarea.value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-swap-${this.state.currentDomain || "all"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("Exported JSON file");
  }

  // Import handler
  private openImportModal(): void {
    const textarea = document.getElementById("importTextarea") as HTMLTextAreaElement;
    if (textarea) textarea.value = "";
    document.getElementById("importModal")?.classList.add("open");
    textarea?.focus();
  }

  private async handleExecuteImport(): Promise<void> {
    const textarea = document.getElementById("importTextarea") as HTMLTextAreaElement;
    const raw = textarea?.value.trim();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const res = await this.sendMessage<{ count: number }>({
          action: IPC_ACTIONS.IMPORT_SESSIONS,
          importedProfiles: parsed,
        });
        document.getElementById("importModal")?.classList.remove("open");
        this.showToast(`Imported ${res.count} profiles`);
        await this.refreshState();
        return;
      }

      if (parsed && typeof parsed === "object" && Array.isArray(parsed.sessions)) {
        const res = await this.sendMessage<{ restoredSessions: number; restoredDomains: number }>({
          action: IPC_ACTIONS.RESTORE_ALL,
          backupPayload: parsed,
          overwrite: false,
        });
        document.getElementById("importModal")?.classList.remove("open");
        this.showToast(`Restored ${res.restoredSessions} profiles`);
        await this.refreshState();
        return;
      }

      throw new Error("Invalid session JSON structure.");
    } catch (err) {
      this.showToast(`Import error: ${(err as Error).message}`);
    }
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
