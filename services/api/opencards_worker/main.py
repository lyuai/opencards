from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from urllib.request import Request, urlopen
import uuid

from PIL import Image


def post(url, payload):
    request = Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def installation_id(directory: Path):
    path = directory / "installation-id"
    if path.exists():
        return path.read_text().strip()
    directory.mkdir(parents=True, exist_ok=True)
    value = uuid.uuid4().hex[:24]
    path.write_text(value)
    path.chmod(0o600)
    return value


def sample_media(job, directory: Path):
    url = job["source"]["url"]
    capture = directory / "captures" / job["id"]
    cache = directory / "media-cache"
    capture.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    cached = cache / f'{hashlib.sha256(url.encode()).hexdigest()}.mp4'
    media = capture / "source.mp4"
    if cached.exists():
        if not media.exists():
            try:
                os.link(cached, media)
            except OSError:
                shutil.copy2(cached, media)
    else:
        subprocess.run([
            "yt-dlp", "--no-playlist", "--no-progress", "--no-warnings",
            "--format", "bv*[height<=1080]+ba/b[height<=1080]", "--merge-output-format", "mp4",
            "--output", str(capture / "source.%(ext)s"), url,
        ], check=True, timeout=2700)
        candidates = sorted(capture.glob("source.*"))
        if not candidates:
            raise RuntimeError("downloaded media file not found")
        media = candidates[0]
        shutil.copy2(media, cached)

    frames = capture / "frames"
    frames.mkdir(exist_ok=True)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(media),
        "-vf", "fps=1,scale=960:-2", "-q:v", "4", str(frames / "frame-%06d.jpg"),
    ], check=True, timeout=2700)
    observations, previous = [], None
    for index, path in enumerate(sorted(frames.glob("frame-*.jpg"))):
        signature = image_signature(path)
        change = difference(previous, signature)
        if previous is not None and change < 6:
            path.unlink()
            continue
        previous = signature
        observations.append({"sequence": len(observations), "timestampMs": index * 1000,
                             "evidence": f"frames/{path.name}", "confidence": 1, "changeScore": change})
    if not observations:
        raise RuntimeError("download produced no usable frames")
    return capture, observations


def image_signature(path: Path):
    with Image.open(path) as image:
        width, height = image.size
        roi = image.crop((width * 18 // 100, height * 40 // 100, width * 92 // 100, height * 70 // 100))
        return list(roi.convert("L").resize((16, 16)).getdata())


def difference(left, right):
    if left is None:
        return 100
    return sum(abs(a - b) for a, b in zip(left, right)) / len(right)


def stable_candidates(observations, minimum_ms=3000):
    return [item for i, item in enumerate(observations)
            if i == len(observations) - 1 or observations[i + 1]["timestampMs"] - item["timestampMs"] >= minimum_ms]


def validation(candidates, threshold_ms=30000):
    gaps = [b["timestampMs"] - a["timestampMs"] for a, b in zip(candidates, candidates[1:])]
    jumps = sum(gap >= threshold_ms for gap in gaps)
    return {"status": "timeline_continuous" if candidates and not jumps else "edited_or_incomplete",
            "stableCandidates": len(candidates), "potentialJumpCuts": jumps,
            "longestGapMs": max(gaps, default=0), "continuousReplayOk": bool(candidates) and not jumps,
            "message": "Card and turn validation is still required."}


def process(api, worker_id, job, data_dir, bridge=None):
    post(f'{api}/v1/jobs/{job["id"]}/heartbeat', {"workerId": worker_id, "stage": "downloading", "progress": .1, "message": "Downloading publicly accessible media"})
    try:
        capture, observations = sample_media(job, data_dir)
    except Exception:
        if bridge is None:
            raise
        post(f'{api}/v1/jobs/{job["id"]}/heartbeat', {"workerId": worker_id, "stage": "waiting_for_browser", "progress": .05, "message": "Direct download unavailable; waiting for authenticated browser capture"})
        bridge.begin(job)
        capture, observations = bridge.wait()
    stable = stable_candidates(observations)
    result = {
        "schemaVersion": "1.0.0", "game": job["game"], "extractionStatus": "observations_captured",
        "recognitionStrategy": "table-roi-change-detection", "observations": observations,
        "stableCandidates": stable, "validation": validation(stable),
        "metrics": {"changedFrames": len(observations), "stableFrames": len(stable), "paidModelCalls": 0},
        "evidenceDirectory": str(capture), "events": [],
    }
    post(f'{api}/v1/jobs/{job["id"]}/complete', {"workerId": worker_id, "result": result})


def main():
    from .capture import CaptureBridge

    api = os.getenv("OPENCARDS_API_URL", "http://localhost:8080").rstrip("/")
    data_dir = Path(os.getenv("OPENCARDS_WORKER_DATA_DIR", "data/worker"))
    worker = post(f"{api}/v1/workers/register", {"installationId": installation_id(data_dir), "capabilities": ["video-download", "guandan"]})["workerId"]
    bridge = CaptureBridge(data_dir)
    bridge.serve(os.getenv("OPENCARDS_CAPTURE_ADDR", "127.0.0.1:8787"))
    while True:
        leased = post(f"{api}/v1/jobs/lease", {"workerId": worker}).get("job")
        if leased:
            try:
                process(api, worker, leased, data_dir, bridge)
            except Exception as exc:
                post(f'{api}/v1/jobs/{leased["id"]}/heartbeat', {"workerId": worker, "stage": "failed", "progress": 0, "message": str(exc)[:500]})
        if os.getenv("OPENCARDS_WORKER_ONCE") == "1":
            return
        time.sleep(3)


if __name__ == "__main__":
    main()
