from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


def configured() -> bool:
    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY"))


def match_snapshot(game) -> dict:
    view = game.view()
    review = view.get("review") or {"deals": [], "summary": {}}
    return {
        "match": {
            "id": view["id"],
            "game": view.get("game", "guandan"),
            "seed": view.get("settings", {}).get("seed"),
            "opponent_policy": view.get("settings", {}).get("opponentPolicy", "danzero"),
            "created_at": view["createdAt"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "winner_team": view.get("winnerTeam"),
            "your_level": view.get("yourLevel"),
            "opponent_level": view.get("opponentLevel"),
            "game_over": bool(view.get("gameOver")),
            "review": review,
        },
        "deals": [_deal_row(view["id"], deal) for deal in review.get("deals") or []],
    }


def save_game(game) -> None:
    if not configured():
        return
    try:
        payload = match_snapshot(game)
        _upsert("matches", payload["match"], "id")
        if payload["deals"]:
            _upsert("deals", payload["deals"], "match_id,number")
    except Exception:
        logging.exception("persist match")


def list_matches(limit: int = 20) -> list[dict]:
    if not configured():
        return []
    rows = _request(
        "GET",
        "matches",
        query={"select": "id,created_at,winner_team,your_level,opponent_level,game_over,review", "order": "created_at.desc", "limit": str(limit)},
    ) or []
    return [_match_public(row) for row in rows]


def get_match(match_id: str) -> dict | None:
    if not configured():
        return None
    rows = _request(
        "GET",
        "matches",
        query={"id": f"eq.{match_id}", "select": "id,created_at,winner_team,your_level,opponent_level,game_over,review", "limit": "1"},
    ) or []
    if not rows:
        return None
    return _match_public(rows[0], include_review=True)


def _deal_row(match_id: str, deal: dict) -> dict:
    return {
        "match_id": match_id,
        "number": deal.get("number"),
        "level_rank": deal.get("levelRank"),
        "your_level": deal.get("yourLevel"),
        "opponent_level": deal.get("opponentLevel"),
        "winner_team": deal.get("winnerTeam"),
        "your_team_won": deal.get("yourTeamWon"),
        "kind": deal.get("kind"),
        "level_gain": deal.get("levelGain") or 0,
        "match_over": bool(deal.get("matchOver")),
        "your_finish": deal.get("yourFinish"),
        "finished": deal.get("finished") or [],
        "opening_hands": deal.get("openingHands") or {},
        "history": deal.get("history") or [],
        "your_turns": deal.get("yourTurns") or [],
        "is_open": bool(deal.get("open")),
    }


def _match_public(row: dict, include_review: bool = False) -> dict:
    review = row.get("review") or {}
    summary = review.get("summary") or {}
    item = {
        "id": row["id"],
        "createdAt": row.get("created_at"),
        "winnerTeam": row.get("winner_team"),
        "yourLevel": row.get("your_level"),
        "opponentLevel": row.get("opponent_level"),
        "gameOver": bool(row.get("game_over")),
        "headline": summary.get("headline") or ("已结束" if row.get("game_over") else "进行中"),
    }
    if include_review:
        item["review"] = review
    return item


def _upsert(table: str, rows, conflict: str) -> None:
    payload = rows if isinstance(rows, list) else [rows]
    _request(
        "POST",
        table,
        payload=payload,
        query={"on_conflict": conflict},
        prefer="resolution=merge-duplicates,return=minimal",
    )


def _request(method: str, table: str, payload=None, query: dict | None = None, prefer: str | None = None):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    path = f"{base}/rest/v1/{table}"
    if query:
        path += "?" + urllib.parse.urlencode(query)
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read().decode()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"supabase {method} {table} failed: {exc.code} {detail}") from exc
