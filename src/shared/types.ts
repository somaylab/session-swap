export interface CookieSnapshot {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: chrome.cookies.SameSiteStatus;
  expirationDate?: number;
  storeId?: string;
  partitionKey?: { topLevelSite?: string; hasCrossSiteAncestor?: boolean } | Record<string, unknown>;
}

export interface StorageSnapshot {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface SessionProfile {
  id: string;
  name: string;
  domain: string;
  tag?: string;
  color?: string;
  cookies: CookieSnapshot[];
  storage: StorageSnapshot;
  createdAt: number;
  lastUsed: number;
  order: number;
}

export interface ActiveSessionsMap {
  [domain: string]: string; // domain -> sessionId
}

export interface StorageSchema {
  sessions: SessionProfile[];
  activeSessions: ActiveSessionsMap;
}

export const IPC_ACTIONS = {
  GET_CURRENT_STATE: "session_swap:get_current_state",
  SAVE_SESSION: "session_swap:save_session",
  APPLY_SESSION: "session_swap:apply_session",
  CLEAR_SESSION: "session_swap:clear_session",
  DELETE_SESSION: "session_swap:delete_session",
  RENAME_SESSION: "session_swap:rename_session",
  REORDER_SESSIONS: "session_swap:reorder_sessions",
  EXPORT_SESSIONS: "session_swap:export_sessions",
  IMPORT_SESSIONS: "session_swap:import_sessions",
  BACKUP_ALL: "session_swap:backup_all",
  RESTORE_ALL: "session_swap:restore_all",
} as const;

export type IpcActionType = (typeof IPC_ACTIONS)[keyof typeof IPC_ACTIONS];

export interface IpcBaseMessage {
  action: IpcActionType;
}

export interface IpcGetCurrentStateMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.GET_CURRENT_STATE;
  domain: string;
  tabId: number;
}

export interface IpcSaveSessionMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.SAVE_SESSION;
  domain: string;
  tabId: number;
  name: string;
  tag?: string;
}

export interface IpcApplySessionMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.APPLY_SESSION;
  sessionId: string;
  tabId: number;
}

export interface IpcClearSessionMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.CLEAR_SESSION;
  domain: string;
  tabId: number;
}

export interface IpcDeleteSessionMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.DELETE_SESSION;
  sessionId: string;
}

export interface IpcRenameSessionMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.RENAME_SESSION;
  sessionId: string;
  newName: string;
  tag?: string;
}

export interface IpcReorderSessionsMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.REORDER_SESSIONS;
  domain: string;
  orderedSessionIds: string[];
}

export interface IpcExportSessionsMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.EXPORT_SESSIONS;
  domain?: string;
}

export interface IpcImportSessionsMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.IMPORT_SESSIONS;
  importedProfiles: unknown;
  fallbackDomain?: string;
  overwrite?: boolean;
}

export interface IpcBackupAllMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.BACKUP_ALL;
}

export interface IpcRestoreAllMessage extends IpcBaseMessage {
  action: typeof IPC_ACTIONS.RESTORE_ALL;
  backupPayload: unknown;
  overwrite?: boolean;
}

export type IpcMessage =
  | IpcGetCurrentStateMessage
  | IpcSaveSessionMessage
  | IpcApplySessionMessage
  | IpcClearSessionMessage
  | IpcDeleteSessionMessage
  | IpcRenameSessionMessage
  | IpcReorderSessionsMessage
  | IpcExportSessionsMessage
  | IpcImportSessionsMessage
  | IpcBackupAllMessage
  | IpcRestoreAllMessage;

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PopupState {
  currentDomain: string;
  currentTabId: number;
  sessions: SessionProfile[];
  activeSessionId: string | null;
}
