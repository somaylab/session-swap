import { MessageRouter } from "./router/messageRouter";

const router = new MessageRouter();

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[session-swap] Extension installed/updated:", details.reason);
  if (details.reason === "install") {
    chrome.storage.local.set({
      ss_sessions: [],
      ss_active_map: {},
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[session-swap] Background service worker started");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  return router.handleMessage(message, sender, sendResponse);
});
