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
  getTagColor,
} from "@shared/utils";

// Inline Vector SVGs
const ICONS = {
  swap: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="14" x2="21" y2="3"></line><polyline points="8 21 3 21 3 16"></polyline><line x1="20" y1="10" x2="3" y2="21"></line></svg>`,
  edit: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`,
  trash: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  cookie: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"></path><path d="M8.5 8.5v.01"></path><path d="M16 15.5v.01"></path><path d="M12 12v.01"></path><path d="M11 17v.01"></path><path d="M7 13v.01"></path></svg>`,
  storage: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
  clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
};

export class PopupController {
  private state: PopupState = {
    currentDomain: "",
    currentTabId: -1,
    sessions: [],
    activeSessionId: null,
  };

  private activeTagFilter = "ALL";
  private searchQuery = "";
  private pendingTargetSessionId: string | null = null;
  private currentTheme: "light" | "dark" = "dark";
  private exportMode: "domain" | "all" = "domain";

  async init(): Promise<void> {
    try {
      await this.initTheme();
      this.setupEventListeners();
      await this.refreshState();
    } catch (err) {
      this.showToast(`Error initializing: ${(err as Error).message}`);
    }
  }

  private async initTheme(): Promise<void> {
    const raw = await chrome.storage.local.get(["ss_theme"]);
    this.currentTheme = raw.ss_theme === "light" ? "light" : "dark";
    this.applyTheme(this.currentTheme);
  }

  private applyTheme(theme: "light" | "dark"): void {
    this.currentTheme = theme;
    document.body.setAttribute("data-theme", theme);
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
    const nextTheme = this.currentTheme === "light" ? "dark" : "light";
    this.applyTheme(nextTheme);
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
      this.updateDomainLabel("No active web tab");
      return;
    }

    const currentTab = tabs[0];
    const domain = currentTab.url ? extractDomainFromUrl(currentTab.url) : "";
    this.state.currentTabId = currentTab.id || -1;
    this.state.currentDomain = domain;

    this.updateDomainLabel(domain || "Unsupported host");

    if (!domain) {
      this.renderEmptyState("This page does not allow extension access (e.g. browser internal page).");
      return;
    }

    const state = await this.sendMessage<PopupState>({
      action: IPC_ACTIONS.GET_CURRENT_STATE,
      domain,
      tabId: this.state.currentTabId,
    });

    this.state.sessions = state.sessions || [];
    this.state.activeSessionId = state.activeSessionId || null;

    this.renderDynamicTagFilters();
    this.renderSessions();
  }

  private updateDomainLabel(text: string): void {
    const el = document.getElementById("activeDomainLabel");
    if (el) el.textContent = text;
  }

  private renderDynamicTagFilters(): void {
    const row = document.getElementById("tagFilterRow");
    if (!row) return;

    // Collect all unique tags used across this domain's profiles
    const uniqueTags = new Set<string>();
    this.state.sessions.forEach((s) => {
      if (s.tag && s.tag.trim()) uniqueTags.add(s.tag.trim());
    });

    row.innerHTML = `<span class="tag-filter-pill ${this.activeTagFilter === "ALL" ? "active" : ""}" data-tag="ALL">ALL</span>`;

    uniqueTags.forEach((tag) => {
      const isActive = this.activeTagFilter === tag;
      const tagColor = getTagColor(tag);
      const pill = document.createElement("span");
      pill.className = `tag-filter-pill ${isActive ? "active" : ""}`;
      pill.dataset.tag = tag;
      pill.textContent = tag.toUpperCase();
      if (!isActive) {
        pill.style.border = `1.5px solid ${tagColor.border}`;
      }
      row.appendChild(pill);
    });
  }

  private setupEventListeners(): void {
    // Theme toggle
    document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
      this.toggleTheme();
    });

    // Save & Blank
    document.getElementById("saveSessionBtn")?.addEventListener("click", () => {
      this.openSaveModal();
    });

    document.getElementById("newBlankBtn")?.addEventListener("click", () => {
      this.handleNewBlank();
    });

    // Search input
    const searchInput = document.getElementById("searchInput") as HTMLInputElement;
    searchInput?.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderSessions();
    });

    // Tag filter click
    const tagFilterRow = document.getElementById("tagFilterRow");
    tagFilterRow?.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest(".tag-filter-pill") as HTMLElement;
      if (!target) return;
      tagFilterRow.querySelectorAll(".tag-filter-pill").forEach((p) => p.classList.remove("active"));
      target.classList.add("active");
      this.activeTagFilter = target.dataset.tag || "ALL";
      this.renderSessions();
    });

    // Modals close button handler
    document.querySelectorAll("[data-modal]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const modalId = (e.currentTarget as HTMLElement).dataset.modal;
        if (modalId) this.closeModal(modalId);
      });
    });

    // Tag chip suggestions in Save Modal
    document.getElementById("saveTagSuggestions")?.addEventListener("click", (e) => {
      const chip = (e.target as HTMLElement).closest(".tag-chip") as HTMLElement;
      if (!chip) return;
      const input = document.getElementById("saveTagInput") as HTMLInputElement;
      if (input) input.value = chip.dataset.val || "";
    });

    // Tag chip suggestions in Rename Modal
    document.getElementById("renameTagSuggestions")?.addEventListener("click", (e) => {
      const chip = (e.target as HTMLElement).closest(".tag-chip") as HTMLElement;
      if (!chip) return;
      const input = document.getElementById("renameTagInput") as HTMLInputElement;
      if (input) input.value = chip.dataset.val || "";
    });

    // Confirm Save
    document.getElementById("confirmSaveBtn")?.addEventListener("click", () => {
      this.handleConfirmSave();
    });

    // Confirm Rename
    document.getElementById("confirmRenameBtn")?.addEventListener("click", () => {
      this.handleConfirmRename();
    });

    // Confirm Delete
    document.getElementById("confirmDeleteBtn")?.addEventListener("click", () => {
      this.handleConfirmDelete();
    });

    // Export Modal Triggers
    document.getElementById("exportModalBtn")?.addEventListener("click", () => {
      this.openExportModal();
    });

    document.getElementById("exportTabCurrent")?.addEventListener("click", () => {
      this.setExportMode("domain");
    });

    document.getElementById("exportTabAll")?.addEventListener("click", () => {
      this.setExportMode("all");
    });

    document.getElementById("copyExportBtn")?.addEventListener("click", () => {
      this.handleCopyExportToClipboard();
    });

    document.getElementById("downloadExportBtn")?.addEventListener("click", () => {
      this.handleDownloadExportFile();
    });

    // Import Modal Triggers
    document.getElementById("importModalBtn")?.addEventListener("click", () => {
      this.openImportModal();
    });

    const importTextarea = document.getElementById("importTextarea") as HTMLTextAreaElement;
    importTextarea?.addEventListener("input", () => {
      this.validateImportText(importTextarea.value);
    });

    document.getElementById("pasteFromClipboardBtn")?.addEventListener("click", () => {
      this.handlePasteFromClipboard();
    });

    const fileInput = document.getElementById("importFileInput") as HTMLInputElement;
    document.getElementById("triggerUploadFileBtn")?.addEventListener("click", () => {
      fileInput?.click();
    });

    fileInput?.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.handleImportFile(file);
    });

    document.getElementById("executeImportBtn")?.addEventListener("click", () => {
      this.handleExecuteImport();
    });
  }

  private renderSessions(): void {
    const container = document.getElementById("sessionsListContainer");
    if (!container) return;

    let filtered = this.state.sessions;

    if (this.activeTagFilter !== "ALL") {
      filtered = filtered.filter((s) => (s.tag || "DEFAULT").toUpperCase() === this.activeTagFilter.toUpperCase());
    }

    if (this.searchQuery) {
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(this.searchQuery) ||
          (s.tag && s.tag.toLowerCase().includes(this.searchQuery))
      );
    }

    if (filtered.length === 0) {
      this.renderEmptyState(
        this.state.sessions.length === 0
          ? "No profiles saved for this domain yet. Click 'SAVE CURRENT' to snapshot your session."
          : "No profiles matching the current search / filter query."
      );
      return;
    }

    container.innerHTML = "";
    filtered.forEach((session) => {
      const card = this.createSessionCard(session);
      container.appendChild(card);
    });
  }

  private createSessionCard(session: SessionProfile): HTMLElement {
    const card = document.createElement("div");
    card.className = "session-card";
    const isActive = session.id === this.state.activeSessionId;
    if (isActive) {
      card.classList.add("is-active");
    }

    const tagMeta = getTagColor(session.tag || "DEFAULT");
    const cookieCount = session.cookies?.length || 0;
    const storageKeys = Object.keys(session.storage?.localStorage || {}).length;

    card.innerHTML = `
      <div class="card-top">
        <div class="card-title-group">
          <span class="session-name">${this.escapeHtml(session.name)}</span>
          <span class="tag-badge" style="background:${tagMeta.bg}; color:${tagMeta.text}; border-color:${tagMeta.border};">
            ${this.escapeHtml(session.tag || "DEFAULT")}
          </span>
        </div>
        ${isActive ? `<span class="active-pill">${ICONS.check} ACTIVE</span>` : ""}
      </div>
      <div class="card-bottom">
        <div class="card-meta">
          <span class="meta-item" title="${cookieCount} cookies captured">${ICONS.cookie} ${cookieCount}</span>
          <span class="meta-item" title="${storageKeys} localStorage keys">${ICONS.storage} ${storageKeys}</span>
          <span class="meta-item" title="Last used timestamp">${ICONS.clock} ${formatRelativeTime(session.lastUsed)}</span>
        </div>
        <div class="card-actions">
          <button class="card-action-btn switch-btn" title="Switch session and hard-reload">
            ${ICONS.swap} SWAP
          </button>
          <button class="card-action-btn rename-btn" title="Edit name & tag">
            ${ICONS.edit}
          </button>
          <button class="card-action-btn delete-btn" title="Delete profile">
            ${ICONS.trash}
          </button>
        </div>
      </div>
    `;

    card.querySelector(".switch-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.handleApplySession(session.id);
    });

    card.querySelector(".rename-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openRenameModal(session);
    });

    card.querySelector(".delete-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openDeleteModal(session);
    });

    // Clicking anywhere on card applies session
    card.addEventListener("click", () => {
      this.handleApplySession(session.id);
    });

    return card;
  }

  private renderEmptyState(msg: string): void {
    const container = document.getElementById("sessionsListContainer");
    if (!container) return;
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        <div class="empty-title">NO SAVED PROFILES</div>
        <div class="empty-desc">${this.escapeHtml(msg)}</div>
      </div>
    `;
  }

  private async handleApplySession(sessionId: string): Promise<void> {
    try {
      this.showToast("Switching session & hard-reloading...");
      await this.sendMessage({
        action: IPC_ACTIONS.APPLY_SESSION,
        sessionId,
        tabId: this.state.currentTabId,
      });
      await this.refreshState();
    } catch (err) {
      this.showToast(`Switch failed: ${(err as Error).message}`);
    }
  }

  private async handleNewBlank(): Promise<void> {
    try {
      this.showToast("Resetting to guest state & reloading...");
      await this.sendMessage({
        action: IPC_ACTIONS.CLEAR_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTabId,
      });
      await this.refreshState();
    } catch (err) {
      this.showToast(`Reset failed: ${(err as Error).message}`);
    }
  }

  private openSaveModal(): void {
    const nameInput = document.getElementById("saveNameInput") as HTMLInputElement;
    const tagInput = document.getElementById("saveTagInput") as HTMLInputElement;
    if (nameInput) {
      const count = this.state.sessions.length + 1;
      nameInput.value = `Profile ${count}`;
    }
    if (tagInput) {
      tagInput.value = "Work";
    }
    this.openModal("saveModal");
    nameInput?.focus();
    nameInput?.select();
  }

  private async handleConfirmSave(): Promise<void> {
    const nameInput = document.getElementById("saveNameInput") as HTMLInputElement;
    const tagInput = document.getElementById("saveTagInput") as HTMLInputElement;
    const name = nameInput?.value.trim() || "Unnamed Session";
    const tag = tagInput?.value.trim() || "Work";

    try {
      this.closeModal("saveModal");
      this.showToast("Snapshotting cookies & storage...");

      await this.sendMessage({
        action: IPC_ACTIONS.SAVE_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTabId,
        name,
        tag,
      });

      this.showToast(`Saved session "${name}"!`);
      await this.refreshState();
    } catch (err) {
      this.showToast(`Save failed: ${(err as Error).message}`);
    }
  }

  private openRenameModal(session: SessionProfile): void {
    this.pendingTargetSessionId = session.id;
    const nameInput = document.getElementById("renameNameInput") as HTMLInputElement;
    const tagInput = document.getElementById("renameTagInput") as HTMLInputElement;
    if (nameInput) nameInput.value = session.name;
    if (tagInput) tagInput.value = session.tag || "Work";

    this.openModal("renameModal");
    nameInput?.focus();
    nameInput?.select();
  }

  private async handleConfirmRename(): Promise<void> {
    if (!this.pendingTargetSessionId) return;
    const nameInput = document.getElementById("renameNameInput") as HTMLInputElement;
    const tagInput = document.getElementById("renameTagInput") as HTMLInputElement;
    const newName = nameInput?.value.trim();
    const newTag = tagInput?.value.trim() || "Work";
    if (!newName) return;

    try {
      this.closeModal("renameModal");
      await this.sendMessage({
        action: IPC_ACTIONS.RENAME_SESSION,
        sessionId: this.pendingTargetSessionId,
        newName,
        tag: newTag,
      });
      this.showToast("Profile updated");
      await this.refreshState();
    } catch (err) {
      this.showToast(`Update failed: ${(err as Error).message}`);
    }
  }

  private openDeleteModal(session: SessionProfile): void {
    this.pendingTargetSessionId = session.id;
    const nameEl = document.getElementById("deleteTargetName");
    if (nameEl) nameEl.textContent = `"${session.name}"`;
    this.openModal("deleteModal");
  }

  private async handleConfirmDelete(): Promise<void> {
    if (!this.pendingTargetSessionId) return;
    try {
      this.closeModal("deleteModal");
      await this.sendMessage({
        action: IPC_ACTIONS.DELETE_SESSION,
        sessionId: this.pendingTargetSessionId,
      });
      this.showToast("Profile deleted");
      await this.refreshState();
    } catch (err) {
      this.showToast(`Delete failed: ${(err as Error).message}`);
    }
  }

  // --- Export Multi-Channel ---
  private async openExportModal(): Promise<void> {
    this.exportMode = "domain";
    document.getElementById("exportTabCurrent")?.classList.add("active");
    document.getElementById("exportTabAll")?.classList.remove("active");
    await this.updateExportPayload();
    this.openModal("exportModal");
  }

  private async setExportMode(mode: "domain" | "all"): Promise<void> {
    this.exportMode = mode;
    const tabCurr = document.getElementById("exportTabCurrent");
    const tabAll = document.getElementById("exportTabAll");
    if (mode === "domain") {
      tabCurr?.classList.add("active");
      tabAll?.classList.remove("active");
    } else {
      tabCurr?.classList.remove("active");
      tabAll?.classList.add("active");
    }
    await this.updateExportPayload();
  }

  private async updateExportPayload(): Promise<void> {
    const textarea = document.getElementById("exportTextarea") as HTMLTextAreaElement;
    if (!textarea) return;

    if (this.exportMode === "domain") {
      const sessions = await this.sendMessage<SessionProfile[]>({
        action: IPC_ACTIONS.EXPORT_SESSIONS,
        domain: this.state.currentDomain,
      });
      textarea.value = JSON.stringify(sessions, null, 2);
    } else {
      const fullBackup = await this.sendMessage<StorageSchema>({
        action: IPC_ACTIONS.BACKUP_ALL,
      });
      textarea.value = JSON.stringify(fullBackup, null, 2);
    }
  }

  private async handleCopyExportToClipboard(): Promise<void> {
    const textarea = document.getElementById("exportTextarea") as HTMLTextAreaElement;
    if (!textarea || !textarea.value) return;

    try {
      await navigator.clipboard.writeText(textarea.value);
      const btn = document.getElementById("copyExportBtn");
      if (btn) {
        btn.innerHTML = `${ICONS.check} COPIED!`;
        setTimeout(() => {
          btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> COPY TO CLIPBOARD`;
        }, 2000);
      }
      this.showToast("Copied JSON payload to clipboard!");
    } catch {
      textarea.select();
      document.execCommand("copy");
      this.showToast("Copied via selection fallback!");
    }
  }

  private handleDownloadExportFile(): void {
    const textarea = document.getElementById("exportTextarea") as HTMLTextAreaElement;
    if (!textarea || !textarea.value) return;

    const blob = new Blob([textarea.value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const label = this.exportMode === "domain" ? this.state.currentDomain || "site" : "all-sites-backup";
    a.download = `session-swap-${label}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("Backup JSON file saved!");
  }

  // --- Import Multi-Channel ---
  private openImportModal(): void {
    const textarea = document.getElementById("importTextarea") as HTMLTextAreaElement;
    const box = document.getElementById("importValidationBox");
    if (textarea) textarea.value = "";
    if (box) box.style.display = "none";
    this.openModal("importModal");
  }

  private validateImportText(raw: string): boolean {
    const box = document.getElementById("importValidationBox");
    const txt = document.getElementById("importValidationText");
    if (!box || !txt) return false;

    const trimmed = raw.trim();
    if (!trimmed) {
      box.style.display = "none";
      return false;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        box.className = "validation-box valid";
        txt.textContent = `${parsed.length} session profile(s) recognized.`;
        return true;
      }
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.sessions)) {
        box.className = "validation-box valid";
        txt.textContent = `Full backup package recognized (${parsed.sessions.length} sessions).`;
        return true;
      }
      box.className = "validation-box invalid";
      txt.textContent = "Unrecognized JSON format (expected session array or full backup).";
      return false;
    } catch {
      box.className = "validation-box invalid";
      txt.textContent = "Invalid JSON syntax. Please check braces and quotes.";
      return false;
    }
  }

  private async handlePasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      const textarea = document.getElementById("importTextarea") as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = text;
        this.validateImportText(text);
      }
      this.showToast("Pasted from clipboard!");
    } catch (err) {
      this.showToast("Clipboard access denied. Please paste manually into the box.");
    }
  }

  private handleImportFile(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const textarea = document.getElementById("importTextarea") as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = content;
        this.validateImportText(content);
      }
      this.showToast(`Loaded ${file.name}`);
    };
    reader.readAsText(file);
  }

  private async handleExecuteImport(): Promise<void> {
    const textarea = document.getElementById("importTextarea") as HTMLTextAreaElement;
    const raw = textarea?.value.trim();
    if (!raw) {
      this.showToast("Please paste or load JSON first.");
      return;
    }

    try {
      const parsed = JSON.parse(raw);

      if (parsed && typeof parsed === "object" && Array.isArray(parsed.sessions)) {
        // Full backup restore
        const res = await this.sendMessage<{ restoredSessions: number; restoredDomains: number }>({
          action: IPC_ACTIONS.RESTORE_ALL,
          backupPayload: parsed,
          overwrite: false,
        });
        this.closeModal("importModal");
        this.showToast(`Restored ${res.restoredSessions} sessions across ${res.restoredDomains} sites!`);
        await this.refreshState();
        return;
      }

      if (Array.isArray(parsed)) {
        // List of profiles
        const res = await this.sendMessage<{ count: number }>({
          action: IPC_ACTIONS.IMPORT_SESSIONS,
          importedProfiles: parsed,
        });
        this.closeModal("importModal");
        this.showToast(`Successfully imported ${res.count} profiles!`);
        await this.refreshState();
        return;
      }

      throw new Error("Invalid session JSON structure.");
    } catch (err) {
      this.showToast(`Import error: ${(err as Error).message}`);
    }
  }

  private openModal(id: string): void {
    document.getElementById(id)?.classList.add("show");
  }

  private closeModal(id: string): void {
    document.getElementById(id)?.classList.remove("show");
  }

  private showToast(message: string): void {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2400);
  }

  private escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
