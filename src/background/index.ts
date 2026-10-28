import { MessageRouter } from "./router/messageRouter";

const router = new MessageRouter();

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[session-swap] Extension installed/updated:", details.reason);
  try {
    const raw = await chrome.storage.local.get(["ss_sessions", "ss_active_map"]);
    const updates: Record<string, unknown> = {};
    if (!Array.isArray(raw.ss_sessions)) {
      updates.ss_sessions = [];
    }
    if (!raw.ss_active_map || typeof raw.ss_active_map !== "object") {
      updates.ss_active_map = {};
    }
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }
  } catch (err) {
    console.error("[session-swap] Failed to ensure storage schema:", err);
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[session-swap] Background service worker started");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  return router.handleMessage(message, sender, sendResponse);
});
