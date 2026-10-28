import { PopupController } from "./controllers/popupController";

document.addEventListener("DOMContentLoaded", async () => {
  const controller = new PopupController();
  await controller.init();

  // Auto-refresh if user changes tabs while popup is open
  try {
    chrome.tabs?.onActivated?.addListener?.(() => {
      controller.init();
    });

    chrome.tabs?.onUpdated?.addListener?.((_tabId, changeInfo) => {
      if (changeInfo.status === "complete") {
        controller.init();
      }
    });
  } catch {}
});
