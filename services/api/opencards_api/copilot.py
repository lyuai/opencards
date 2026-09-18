from __future__ import annotations

import json
import os

from openai import OpenAI


SYSTEM_PROMPT = """你是 OpenCards 的掼蛋教练。
根据当前公开牌面回答玩家的问题。讲清楚利弊，区分事实、推断和不确定之处。不要编造别人手里的牌、模型分数或非法出牌。对比另一种打法时，先对照合法出牌。用简体中文，具体但别啰嗦。"""


def ask_copilot(game_state: dict, recommendation: dict, message: str, conversation: list[dict], reasoning_effort: str = "medium", coaching_style: str = "detailed") -> dict:
    api_key = os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY")
    model = os.getenv("AI_MODEL") or os.getenv("OPENAI_MODEL")
    base_url = os.getenv("AI_BASE_URL") or os.getenv("OPENAI_BASE_URL")
    if not api_key or not model:
        raise RuntimeError("教练还没配置，暂时只能给出出牌建议")

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
    if reasoning_effort not in {"low", "medium", "high"}:
        raise RuntimeError("reasoningEffort must be low, medium, or high")
    styles = {
        "direct": "Lead with the recommended move and keep the explanation compact.",
        "detailed": "Explain the move, alternatives, risks, and likely follow-up play in detail.",
        "socratic": "Coach by asking one useful question, then explain the key strategic idea.",
    }
    if coaching_style not in styles:
        raise RuntimeError("coachingStyle must be direct, detailed, or socratic")
    response = client.responses.create(
        model=model,
        instructions=SYSTEM_PROMPT + "\n" + styles[coaching_style],
        reasoning={"effort": reasoning_effort},
        input=[{"role": "developer", "content": "Live game state:\n" + json.dumps(context, ensure_ascii=False)}]
        + dialogue
        + [{"role": "user", "content": message}],
    )
    return {"content": response.output_text, "provider": os.getenv("AI_PROVIDER", model), "responseId": response.id, "reasoningEffort": reasoning_effort, "coachingStyle": coaching_style}
