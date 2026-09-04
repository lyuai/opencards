chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.windowId) return;
  const response = await chrome.tabs.sendMessage(tab.id, { type: "toggle-capture" }).catch((error) => ({ error: error.message }));
  if (response?.error) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: "ERR" });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b42d2d" });
    return;
  }
  await chrome.action.setBadgeText({ tabId: tab.id, text: response?.capturing ? "REC" : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#b42d2d" });
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== "capture-frame" || !sender.tab?.windowId) return;
  captureAndSend(sender.tab.windowId, message).then(respond).catch((error) => respond({ error: error.message }));
  return true;
});

async function captureAndSend(windowId, message) {
  const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 82 });
  const blob = await (await fetch(screenshot)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = message.devicePixelRatio || 1;
  const source = {
    x: Math.max(0, Math.round(message.rect.x * scale)),
    y: Math.max(0, Math.round(message.rect.y * scale)),
    width: Math.min(bitmap.width, Math.round(message.rect.width * scale)),
    height: Math.min(bitmap.height, Math.round(message.rect.height * scale)),
  };
  const canvas = new OffscreenCanvas(source.width, source.height);
  canvas.getContext("2d").drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
  const cropped = await canvas.convertToBlob({ type: "image/jpeg", quality: .82 });
  const response = await fetch(`http://127.0.0.1:8787/v1/capture/frames?timestampMs=${message.timestampMs}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: cropped,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
