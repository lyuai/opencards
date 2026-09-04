# OpenCards Capture extension

This unpacked Chrome extension sends the visible video region from an authorized
Bilibili session to the local worker at `127.0.0.1:8787`. It does not read or
export cookies and does not discover media URLs.

1. Start the API and worker.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select this directory.
4. Create a Bilibili import task in `/training`.
5. Open the matching video, start playback, and click the extension icon.
6. Click the icon again when playback finishes.

The worker crops the player before upload, samples once per second, rejects
near-duplicate frames locally, and saves accepted evidence plus
`observations.json` under its private data directory.
