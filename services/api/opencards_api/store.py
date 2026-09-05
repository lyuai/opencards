from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import threading
import uuid


def now() -> datetime:
    return datetime.now(timezone.utc)


def stamp(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


class JobStore:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.RLock()
        try:
            self.jobs = json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            self.jobs = {}

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(self.jobs, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    def create(self, payload):
        instant = now()
        item = {
            "id": f"job-{uuid.uuid4().hex[:16]}", "game": payload["game"],
            "source": payload["source"], "status": "queued", "stage": "queued",
            "progress": 0, "createdAt": stamp(instant), "updatedAt": stamp(instant),
        }
        with self.lock:
            self.jobs[item["id"]] = item
            self._save()
        return deepcopy(item)

    def get(self, job_id):
        with self.lock:
            return deepcopy(self.jobs.get(job_id))

    def lease(self, worker_id):
        with self.lock:
            instant = now()
            for item in self.jobs.values():
                expired = item.get("leaseUntil", "") < stamp(instant)
                if item["status"] != "queued" and not (item["status"] == "leased" and expired):
                    continue
                item.update(status="leased", stage="starting", workerId=worker_id,
                            leaseUntil=stamp(instant + timedelta(seconds=45)), updatedAt=stamp(instant))
                self._save()
                return deepcopy(item)
        return None

    def update(self, job_id, worker_id, *, stage, message, progress, result=None):
        with self.lock:
            item = self.jobs.get(job_id)
            if not item:
                raise KeyError("job not found")
            if item.get("workerId") != worker_id:
                raise ValueError("job lease belongs to another worker")
            instant = now()
            item.update(stage=stage, message=message, progress=progress, updatedAt=stamp(instant))
            if result is None:
                item.update(status="leased", leaseUntil=stamp(instant + timedelta(seconds=45)))
            else:
                item.update(status="completed", stage="completed", progress=1, result=result)
                item.pop("leaseUntil", None)
            self._save()
            return deepcopy(item)

