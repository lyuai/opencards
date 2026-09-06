from opencards_api.app import create_app


def advance_to_human(client, deal):
    while deal["turn"] != "south" and not deal["gameOver"]:
        response = client.post(f'/v1/games/guandan/deals/{deal["id"]}/ai-actions')
        assert response.status_code == 200
        next_deal = response.get_json()
        assert len(next_deal["history"]) == len(deal["history"]) + 1
        deal = next_deal
    return deal


def test_health_reports_python_policy_runtime(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENCARDS_DATA_DIR", str(tmp_path))
    client = create_app(testing=True).test_client()
    assert client.get("/healthz").get_json() == {
        "status": "ok", "runtime": "python", "policy": "danzero"
    }


def test_deal_coach_and_play_contract(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENCARDS_DATA_DIR", str(tmp_path))
    client = create_app(testing=True).test_client()

    deal_response = client.post("/v1/games/guandan/deals")
    assert deal_response.status_code == 201
    deal = advance_to_human(client, deal_response.get_json())
    assert len(deal["yourHand"]) == 27
    assert deal["turn"] == "south"

    coach_response = client.post(f'/v1/games/guandan/deals/{deal["id"]}/coach')
    assert coach_response.status_code == 200
    advice = coach_response.get_json()
    assert advice["provider"] == "policy:danzero"
    assert len(advice["moveAnalyses"]) == len(deal["history"])
    assert {item["seat"] for item in advice["moveAnalyses"]} <= {"south", "east", "north", "west"}

    play_response = client.post(
        f'/v1/games/guandan/deals/{deal["id"]}/actions',
        json={"cardIds": advice["cardIds"], "pass": not advice["cardIds"]},
    )
    assert play_response.status_code == 200
    assert play_response.get_json()["history"]


def test_copilot_chat_receives_live_game_context(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENCARDS_DATA_DIR", str(tmp_path))
    captured = {}

    def fake_copilot(game_state, recommendation, message, conversation, reasoning_effort, coaching_style):
        captured.update(game_state=game_state, recommendation=recommendation, message=message, conversation=conversation, reasoning_effort=reasoning_effort, coaching_style=coaching_style)
        return {"content": "Because it preserves the pair.", "provider": "test", "responseId": "response-1"}

    monkeypatch.setattr("opencards_api.app.ask_copilot", fake_copilot)
    client = create_app(testing=True).test_client()
    deal = advance_to_human(client, client.post("/v1/games/guandan/deals").get_json())
    response = client.post(
        f'/v1/games/guandan/deals/{deal["id"]}/copilot/messages',
        json={"message": "Why this move?", "conversation": [], "reasoningEffort": "high", "coachingStyle": "socratic"},
    )
    assert response.status_code == 200
    assert response.get_json()["content"] == "Because it preserves the pair."
    assert captured["game_state"]["id"] == deal["id"]
    assert captured["game_state"]["legalActions"]
    assert captured["recommendation"]["cardIds"] is not None
    assert captured["reasoning_effort"] == "high"
    assert captured["coaching_style"] == "socratic"


def test_deal_accepts_reproducible_settings(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENCARDS_DATA_DIR", str(tmp_path))
    client = create_app(testing=True).test_client()
    first = client.post("/v1/games/guandan/deals", json={"seed": 42, "opponentPolicy": "danzero"}).get_json()
    second = client.post("/v1/games/guandan/deals", json={"seed": 42, "opponentPolicy": "danzero"}).get_json()
    assert first["settings"] == {"seed": 42, "opponentPolicy": "danzero"}
    assert [card["rank"] + card["suit"] for card in first["yourHand"]] == [card["rank"] + card["suit"] for card in second["yourHand"]]
