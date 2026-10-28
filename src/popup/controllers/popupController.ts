import {
  IPC_ACTIONS,
  IpcMessage,
  IpcResponse,
  PopupState,
  SessionProfile,
} from "@shared/types";
import {
  extractDomainFromUrl,
  formatRelativeTime,
  TAG_COLORS,
} from "@shared/utils";

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
  private selectedSaveTag = "Work";
  private selectedRenameTag = "Work";

  async init(): Promise<void> {
    try {
      this.setupEventListeners();
      await this.refreshState();
    } catch (err) {
      this.showToast(`Error initializing: ${(err as Error).message}`);
    }
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

    this.updateDomainLabel(domain || "Unsupported page");

    if (!domain) {
      this.renderEmptyState("Unsupported page protocol (e.g. chrome:// or local file)");
      return;
    }

    const state = await this.sendMessage<PopupState>({
      action: IPC_ACTIONS.GET_CURRENT_STATE,
      domain,
      tabId: this.state.currentTabId,
    });

    this.state.sessions = state.sessions || [];
    this.state.activeSessionId = state.activeSessionId || null;

    this.renderSessions();
  }

  private updateDomainLabel(text: string): void {
    const el = document.getElementById("activeDomainLabel");
    if (el) el.textContent = text;
  }

  private setupEventListeners(): void {
    // Quick Actions
    document.getElementById("saveSessionBtn")?.addEventListener("click", () => {
      this.openSaveModal();
    });

    document.getElementById("newBlankBtn")?.addEventListener("click", () => {
      this.handleNewBlank();
    });

    // Search and Tags
    const searchInput = document.getElementById("searchInput") as HTMLInputElement;
    searchInput?.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderSessions();
    });

    const tagFilterRow = document.getElementById("tagFilterRow");
    tagFilterRow?.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest(".tag-filter-pill") as HTMLElement;
      if (!target) return;
      tagFilterRow.querySelectorAll(".tag-filter-pill").forEach((p) => p.classList.remove("active"));
      target.classList.add("active");
      this.activeTagFilter = target.dataset.tag || "ALL";
      this.renderSessions();
    });

    // Modals Close handlers
    document.querySelectorAll("[data-modal]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const modalId = (e.currentTarget as HTMLElement).dataset.modal;
        if (modalId) this.closeModal(modalId);
      });
    });

    // Save Modal Tag Selector
    const saveTagRow = document.getElementById("saveTagRow");
    saveTagRow?.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest(".tag-option") as HTMLElement;
      if (!target) return;
      saveTagRow.querySelectorAll(".tag-option").forEach((p) => p.classList.remove("selected"));
      target.classList.add("selected");
      this.selectedSaveTag = target.dataset.tag || "Work";
    });

    // Confirm Save
    document.getElementById("confirmSaveBtn")?.addEventListener("click", () => {
      this.handleConfirmSave();
    });

    // Rename Modal Tag Selector
    const renameTagRow = document.getElementById("renameTagRow");
    renameTagRow?.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest(".tag-option") as HTMLElement;
      if (!target) return;
      renameTagRow.querySelectorAll(".tag-option").forEach((p) => p.classList.remove("selected"));
      target.classList.add("selected");
      this.selectedRenameTag = target.dataset.tag || "Work";
    });

    // Confirm Rename
    document.getElementById("confirmRenameBtn")?.addEventListener("click", () => {
      this.handleConfirmRename();
    });

    // Confirm Delete
    document.getElementById("confirmDeleteBtn")?.addEventListener("click", () => {
      this.handleConfirmDelete();
    });

    // Export & Import
    document.getElementById("exportBtn")?.addEventListener("click", () => {
      this.handleExport();
    });

    const fileInput = document.getElementById("importFileInput") as HTMLInputElement;
    document.getElementById("importBtn")?.addEventListener("click", () => {
      fileInput?.click();
    });

    fileInput?.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.handleImportFile(file);
    });
  }

  private renderSessions(): void {
    const container = document.getElementById("sessionsListContainer");
    if (!container) return;

    let filtered = this.state.sessions;

    if (this.activeTagFilter !== "ALL") {
      filtered = filtered.filter((s) => (s.tag || "Default") === this.activeTagFilter);
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
          ? "No sessions saved for this site yet. Click 'SAVE CURRENT' to snapshot your login."
          : "No sessions matching the current filter."
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

    const tagMeta = TAG_COLORS[session.tag || "Default"] || TAG_COLORS.Default;
    const cookieCount = session.cookies?.length || 0;
    const storageKeys = Object.keys(session.storage?.localStorage || {}).length;

    card.innerHTML = `
      <div class="card-top">
        <div class="card-title-group">
          <span class="session-name">${this.escapeHtml(session.name)}</span>
          <span class="tag-badge" style="background:${tagMeta.bg}; color:${tagMeta.text};">${session.tag || "DEFAULT"}</span>
        </div>
        ${isActive ? '<span class="active-badge">ACTIVE</span>' : ""}
      </div>
      <div class="card-bottom">
        <span class="card-meta">🍪 ${cookieCount} | 💾 ${storageKeys} | ${formatRelativeTime(session.lastUsed)}</span>
        <div class="card-actions">
          <button class="card-action-btn switch-btn" title="Switch to this profile">⚡ SWAP</button>
          <button class="card-action-btn rename-btn" title="Rename profile">✏</button>
          <button class="card-action-btn delete-btn" title="Delete profile">🗑</button>
        </div>
      </div>
    `;

    // Event handlers
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

    // Clicking card directly also switches
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
        <div class="empty-title">NO SESSIONS</div>
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
      this.showToast(`Failed to switch: ${(err as Error).message}`);
    }
  }

  private async handleNewBlank(): Promise<void> {
    try {
      this.showToast("Wiping session for clean state...");
      await this.sendMessage({
        action: IPC_ACTIONS.CLEAR_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTabId,
      });
      await this.refreshState();
    } catch (err) {
      this.showToast(`Failed to reset: ${(err as Error).message}`);
    }
  }

  private openSaveModal(): void {
    const input = document.getElementById("saveNameInput") as HTMLInputElement;
    if (input) {
      const count = this.state.sessions.length + 1;
      input.value = `Profile ${count}`;
    }
    this.openModal("saveModal");
    input?.focus();
    input?.select();
  }

  private async handleConfirmSave(): Promise<void> {
    const input = document.getElementById("saveNameInput") as HTMLInputElement;
    const name = input?.value.trim() || "Unnamed Session";

    try {
      this.closeModal("saveModal");
      this.showToast("Capturing cookies & storage...");

      await this.sendMessage({
        action: IPC_ACTIONS.SAVE_SESSION,
        domain: this.state.currentDomain,
        tabId: this.state.currentTabId,
        name,
        tag: this.selectedSaveTag,
      });

      this.showToast(`Saved session "${name}"!`);
      await this.refreshState();
    } catch (err) {
      this.showToast(`Save failed: ${(err as Error).message}`);
    }
  }

  private openRenameModal(session: SessionProfile): void {
    this.pendingTargetSessionId = session.id;
    const input = document.getElementById("renameNameInput") as HTMLInputElement;
    if (input) input.value = session.name;

    const renameTagRow = document.getElementById("renameTagRow");
    renameTagRow?.querySelectorAll(".tag-option").forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.dataset.tag === (session.tag || "Work")) {
        htmlEl.classList.add("selected");
      } else {
        htmlEl.classList.remove("selected");
      }
    });
    this.selectedRenameTag = session.tag || "Work";

    this.openModal("renameModal");
    input?.focus();
    input?.select();
  }

  private async handleConfirmRename(): Promise<void> {
    if (!this.pendingTargetSessionId) return;
    const input = document.getElementById("renameNameInput") as HTMLInputElement;
    const newName = input?.value.trim();
    if (!newName) return;

    try {
      this.closeModal("renameModal");
      await this.sendMessage({
        action: IPC_ACTIONS.RENAME_SESSION,
        sessionId: this.pendingTargetSessionId,
        newName,
        tag: this.selectedRenameTag,
      });
      this.showToast("Profile renamed");
      await this.refreshState();
    } catch (err) {
      this.showToast(`Rename failed: ${(err as Error).message}`);
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

  private async handleExport(): Promise<void> {
    try {
      const sessions = await this.sendMessage<SessionProfile[]>({
        action: IPC_ACTIONS.EXPORT_SESSIONS,
        domain: this.state.currentDomain,
      });

      if (!sessions || sessions.length === 0) {
        this.showToast("No profiles to export");
        return;
      }

      const json = JSON.stringify(sessions, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session-swap-${this.state.currentDomain || "all"}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast("Sessions exported to JSON!");
    } catch (err) {
      this.showToast(`Export error: ${(err as Error).message}`);
    }
  }

  private handleImportFile(file: File): void {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const profiles = JSON.parse(content);
        const res = await this.sendMessage<{ count: number }>({
          action: IPC_ACTIONS.IMPORT_SESSIONS,
          importedProfiles: profiles,
        });

        this.showToast(`Imported ${res.count} profiles!`);
        await this.refreshState();
      } catch (err) {
        this.showToast(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
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
    }, 2200);
  }

  private escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
