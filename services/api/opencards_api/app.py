from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

from .copilot import ask_copilot
from .game import GameStore
from .store import JobStore


def create_app(testing: bool = False) -> Flask:
    app = Flask(__name__)
    app.config["TESTING"] = testing
    CORS(app, origins=[os.getenv("WEB_ORIGIN", "http://localhost:3000")])
    data_dir = Path(os.getenv("OPENCARDS_DATA_DIR", Path(__file__).parents[1] / "data"))
    games = GameStore()
    jobs = JobStore(data_dir / "jobs.json")
    feedback = []

    def error(message, status):
        return jsonify(error=message), status

    @app.get("/healthz")
    def health():
        return jsonify(status="ok", runtime="python", policy="danzero")

    @app.get("/v1/games")
    def games_index():
        return jsonify(games=[{"id": "guandan", "name": "掼蛋", "status": "playable"}, {"id": "kards", "name": "KARDS", "status": "planned"}])

    @app.post("/v1/games/guandan/deals")
    def create_deal():
        try:
            body = request.get_json(silent=True) or {}
            seed = body.get("seed")
            if seed is not None:
                seed = int(seed)
            return jsonify(games.create(seed=seed, opponent_policy=body.get("opponentPolicy", "danzero")).view()), 201
        except (TypeError, ValueError) as exc:
            return error(str(exc), 422)
        except Exception as exc:  # model load failures must be visible
            app.logger.exception("create DanZero deal")
            return error(f"could not start DanZero game: {exc}", 500)

    @app.post("/v1/games/guandan/deals/<game_id>/actions")
    def play(game_id):
        game = games.get(game_id)
        if not game:
            return error("game not found", 404)
        body = request.get_json(silent=True) or {}
        try:
            return jsonify(game.act(body.get("cardIds", []), bool(body.get("pass"))))
        except ValueError as exc:
            return error(str(exc), 422)

    @app.post("/v1/games/guandan/deals/<game_id>/coach")
    def coach_game(game_id):
        game = games.get(game_id)
        if not game:
            return error("game not found", 404)
        try:
            return jsonify(game.advise())
        except ValueError as exc:
            return error(str(exc), 409)
        except Exception as exc:
            app.logger.exception("DanZero coach")
            return error(f"DanZero policy unavailable: {exc}", 502)

    @app.post("/v1/games/guandan/deals/<game_id>/copilot/messages")
    def copilot_message(game_id):
        game = games.get(game_id)
        if not game:
            return error("game not found", 404)
        body = request.get_json(silent=True) or {}
        message = str(body.get("message", "")).strip()
        if not message:
            return error("message is required", 400)
        try:
            return jsonify(ask_copilot(game.copilot_context(), game.advise(), message, body.get("conversation") or []))
        except ValueError as exc:
            return error(str(exc), 409)
        except RuntimeError as exc:
            return error(str(exc), 503)
        except Exception as exc:
            app.logger.exception("Arena Copilot")
            return error(f"Arena Copilot unavailable: {exc}", 502)

    @app.post("/v1/imports")
    def create_import():
        body = request.get_json(silent=True) or {}
        source = body.get("source") or {}
        if not body.get("game") or not source.get("provider") or not source.get("url"):
            return error("game, source.provider, and source.url are required", 400)
        return jsonify(jobs.create(body)), 202

    @app.get("/v1/imports/<job_id>")
    def get_import(job_id):
        item = jobs.get(job_id)
        return jsonify(item) if item else error("import not found", 404)

    @app.post("/v1/workers/register")
    def register_worker():
        body = request.get_json(silent=True) or {}
        if not body.get("installationId"):
            return error("installationId is required", 400)
        return jsonify(workerId=f'worker-{body["installationId"]}', leaseSeconds=45)

    @app.post("/v1/jobs/lease")
    def lease_job():
        body = request.get_json(silent=True) or {}
        if not body.get("workerId"):
            return error("workerId is required", 400)
        return jsonify(job=jobs.lease(body["workerId"]))

    @app.post("/v1/jobs/<job_id>/heartbeat")
    def heartbeat(job_id):
        body = request.get_json(silent=True) or {}
        try:
            item = jobs.update(job_id, body.get("workerId"), stage=body.get("stage", "working"), message=body.get("message", ""), progress=float(body.get("progress", 0)))
            return jsonify(item)
        except (KeyError, ValueError) as exc:
            return error(str(exc), 409)

    @app.post("/v1/jobs/<job_id>/complete")
    def complete(job_id):
        body = request.get_json(silent=True) or {}
        try:
            item = jobs.update(job_id, body.get("workerId"), stage="completed", message="Capture and local recognition complete", progress=1, result=body.get("result") or {})
            return jsonify(item)
        except (KeyError, ValueError) as exc:
            return error(str(exc), 409)

    @app.post("/v1/feedback")
    def submit_feedback():
        body = request.get_json(silent=True) or {}
        if not body.get("recommendationId") or not body.get("comment"):
            return error("recommendationId and comment are required", 400)
        feedback.append(body)
        return jsonify(status="queued_for_review"), 202

    return app


def main():
    port = int(os.getenv("PORT", "8080"))
    create_app().run(host="0.0.0.0", port=port, threaded=True)


if __name__ == "__main__":
    main()
