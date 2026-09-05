from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import threading

from flask import Flask, jsonify, request
from PIL import Image

from .main import difference


class CaptureBridge:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.current = None
        self.lock = threading.RLock()
        self.done = threading.Event()
        self.app = Flask("opencards-capture")
        self._routes()

    def begin(self, job):
        directory = self.data_dir / "captures" / job["id"]
        directory.mkdir(parents=True, exist_ok=True)
        with self.lock:
            self.current = {"job": job, "directory": directory, "observations": [], "signature": None}
            self.done.clear()

    def wait(self, timeout=1800):
        if not self.done.wait(timeout):
            raise TimeoutError("authenticated browser capture timed out")
        with self.lock:
            session = self.current
            self.current = None
        return session["directory"], session["observations"]

    def serve(self, address):
        host, port = address.rsplit(":", 1)
        threading.Thread(target=lambda: self.app.run(host=host, port=int(port), threaded=True, use_reloader=False), daemon=True).start()

    def _routes(self):
        @self.app.after_request
        def cors(response):
            origin = request.headers.get("Origin", "")
            if origin.startswith("chrome-extension://"):
                response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            return response

        @self.app.get("/healthz")
        def health():
            return jsonify(status="ok")

        @self.app.get("/v1/capture/session")
        def session():
            with self.lock:
                if not self.current:
                    return jsonify(session=None)
                return jsonify(session={"jobId": self.current["job"]["id"], "sourceUrl": self.current["job"]["source"]["url"], "frames": len(self.current["observations"])})

        @self.app.post("/v1/capture/frames")
        def frame():
            origin = request.headers.get("Origin", "")
            if origin and not origin.startswith("chrome-extension://"):
                return jsonify(error="capture bridge only accepts the OpenCards browser extension"), 403
            try:
                timestamp = int(request.args["timestampMs"])
                data = request.get_data(cache=False)
                signature = self._signature(data)
            except Exception:
                return jsonify(error="invalid frame"), 400
            with self.lock:
                if not self.current:
                    return jsonify(error="no active capture"), 409
                score = difference(self.current["signature"], signature)
                if self.current["signature"] is not None and score < 6:
                    return jsonify(accepted=False, changeScore=score), 202
                self.current["signature"] = signature
                sequence = len(self.current["observations"])
                name = f"frame-{sequence:06d}-{timestamp:010d}.jpg"
                (self.current["directory"] / name).write_bytes(data)
                self.current["observations"].append({"sequence": sequence, "timestampMs": timestamp, "evidence": name, "confidence": 1, "changeScore": score})
                return jsonify(accepted=True, sequence=sequence, changeScore=score), 202

        @self.app.post("/v1/capture/complete")
        def complete():
            with self.lock:
                if not self.current:
                    return jsonify(error="no active capture"), 409
                result = {"directory": str(self.current["directory"]), "observations": self.current["observations"]}
                (self.current["directory"] / "observations.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
                self.done.set()
                return jsonify(result)

    @staticmethod
    def _signature(data):
        with Image.open(BytesIO(data)) as image:
            return list(image.convert("L").resize((16, 16)).getdata())
