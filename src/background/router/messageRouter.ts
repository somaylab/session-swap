import { SessionManager } from "@background/core/sessionManager";
import {
  IPC_ACTIONS,
  IpcMessage,
  IpcResponse,
  PopupState,
  SessionProfile,
} from "@shared/types";

export class MessageRouter {
  private sessionManager = new SessionManager();

  handleMessage(
    message: IpcMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: IpcResponse) => void
  ): boolean {
    if (!message || typeof message !== "object" || !message.action) {
      sendResponse({ success: false, error: "Invalid IPC payload" });
      return false;
    }

    this.process(message)
      .then((data) => {
        try {
          sendResponse({ success: true, data });
        } catch (sendErr) {
          console.warn("[MessageRouter] Response delivery aborted:", sendErr);
        }
      })
      .catch((err: Error) => {
        console.error("[MessageRouter] Error processing message:", message?.action, err);
        try {
          sendResponse({ success: false, error: err.message || "Internal error" });
        } catch (sendErr) {
          console.warn("[MessageRouter] Error response delivery aborted:", sendErr);
        }
      });

    // Return true for async sendResponse
    return true;
  }

  private async process(message: IpcMessage): Promise<unknown> {
    switch (message.action) {
      case IPC_ACTIONS.GET_CURRENT_STATE: {
        const store = await this.sessionManager.getStorageData();
        const domainSessions = store.sessions
          .filter((s) => s.domain === message.domain)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const activeId = store.activeSessions[message.domain] || null;

        const state: PopupState = {
          currentDomain: message.domain,
          currentTabId: message.tabId,
          sessions: domainSessions,
          activeSessionId: activeId,
        };
        return state;
      }

      case IPC_ACTIONS.SAVE_SESSION: {
        return await this.sessionManager.saveSession(
          message.domain,
          message.tabId,
          message.name,
          message.tag
        );
      }

      case IPC_ACTIONS.APPLY_SESSION: {
        await this.sessionManager.applySession(message.sessionId, message.tabId);
        return { applied: true };
      }

      case IPC_ACTIONS.CLEAR_SESSION: {
        await this.sessionManager.clearCurrentSession(message.domain, message.tabId);
        return { cleared: true };
      }

      case IPC_ACTIONS.DELETE_SESSION: {
        await this.sessionManager.deleteSession(message.sessionId);
        return { deleted: true };
      }

      case IPC_ACTIONS.RENAME_SESSION: {
        await this.sessionManager.renameSession(message.sessionId, message.newName, message.tag);
        return { renamed: true };
      }

      case IPC_ACTIONS.REORDER_SESSIONS: {
        await this.sessionManager.reorderSessions(message.domain, message.orderedSessionIds);
        return { reordered: true };
      }

      case IPC_ACTIONS.EXPORT_SESSIONS: {
        return await this.sessionManager.exportSessions(message.domain);
      }

      case IPC_ACTIONS.IMPORT_SESSIONS: {
        return await this.sessionManager.importSessions(
          message.importedProfiles,
          message.fallbackDomain,
          message.overwrite
        );
      }

      case IPC_ACTIONS.BACKUP_ALL: {
        return await this.sessionManager.backupAll();
      }

      case IPC_ACTIONS.RESTORE_ALL: {
        return await this.sessionManager.restoreAll(
          message.backupPayload,
          message.overwrite
        );
      }

      default:
        throw new Error(`Unknown action: ${(message as { action?: string }).action}`);
    }
  }
}
