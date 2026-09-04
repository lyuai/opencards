let captureTimer = null;
let captured = 0;

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type !== "toggle-capture") return;
  if (captureTimer) {
    stopCapture().then(() => respond({ capturing: false, captured }));
  } else {
    startCapture().then(() => respond({ capturing: true, captured })).catch((error) => respond({ error: error.message }));
  }
  return true;
});

async function startCapture() {
  const video = document.querySelector("video");
  if (!video) throw new Error("No video element found");
  const response = await fetch("http://127.0.0.1:8787/v1/capture/session");
  const { session } = await response.json();
  if (!session) throw new Error("No OpenCards task is waiting for browser capture");
  captured = 0;
  await capture(video);
  captureTimer = window.setInterval(() => capture(video), 1000);
}

async function capture(video) {
  if (video.paused || video.ended) return;
  const rect = video.getBoundingClientRect();
  const response = await chrome.runtime.sendMessage({
    type: "capture-frame",
    timestampMs: Math.round(video.currentTime * 1000),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    devicePixelRatio: window.devicePixelRatio,
  });
  if (response?.accepted) captured++;
}

async function stopCapture() {
  window.clearInterval(captureTimer);
  captureTimer = null;
  await fetch("http://127.0.0.1:8787/v1/capture/complete", { method: "POST" });
}
