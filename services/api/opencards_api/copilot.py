from __future__ import annotations

import json
import os

from openai import OpenAI


SYSTEM_PROMPT = """You are Arena Copilot, an expert Guandan coach.
Answer the player's question using the supplied live game state. Explain strategic tradeoffs clearly and distinguish facts, inferences, and uncertainty. Never invent hidden cards, model scores, or legal moves. When comparing an alternative play, verify it against legal context when available. Be concise but specific."""


def ask_copilot(game_state: dict, recommendation: dict, message: str, conversation: list[dict]) -> dict:
    api_key = os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY")
    model = os.getenv("AI_MODEL") or os.getenv("OPENAI_MODEL")
    base_url = os.getenv("AI_BASE_URL") or os.getenv("OPENAI_BASE_URL")
    if not api_key or not model:
        raise RuntimeError("Arena Copilot model is not configured")

    client = OpenAI(api_key=api_key, base_url=base_url or None)
    context = {
        "game": game_state["game"],
        "levelRank": game_state["levelRank"],
        "turn": game_state["turn"],
        "yourHand": game_state["yourHand"],
        "counts": game_state["counts"],
        "currentPlay": game_state.get("currentPlay"),
        "history": game_state["history"],
        "legalActions": game_state.get("legalActions", []),
        "policyRecommendation": recommendation,
    }
    dialogue = [
        {"role": item.get("role"), "content": item.get("content", "")}
        for item in conversation[-12:]
        if item.get("role") in {"user", "assistant"} and item.get("content")
    ]
    response = client.responses.create(
        model=model,
        instructions=SYSTEM_PROMPT,
        input=[{"role": "developer", "content": "Live game state:\n" + json.dumps(context, ensure_ascii=False)}]
        + dialogue
        + [{"role": "user", "content": message}],
    )
    return {"content": response.output_text, "provider": os.getenv("AI_PROVIDER", model), "responseId": response.id}
