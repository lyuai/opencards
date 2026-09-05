from opencards_api.game import PolicyGame


def test_danzero_advice_is_an_engine_legal_action():
    game = PolicyGame(seed=42)
    before = game.view()
    advice = game.advise()

    assert before["turn"] == "south"
    assert before["policy"]["name"] == "DanZero"
    assert advice["provider"] == "policy:danzero"
    assert advice["confidence"] == 0  # checkpoint does not expose calibrated confidence
    assert advice["policy"]["legalActionCount"] > 1

    after = game.act(advice["cardIds"], not advice["cardIds"])
    assert len(after["history"]) >= 1
    assert [item["index"] for item in after["history"]] == list(range(1, len(after["history"]) + 1))


def test_complete_match_reaches_a_real_engine_result():
    game = PolicyGame(seed=7)
    decisions = 0
    while not game.env.is_over() and decisions < 10000:
        advice = game.advise()
        game.act(advice["cardIds"], not advice["cardIds"])
        decisions += 1

    assert decisions < 10000
    assert game.env.is_over()
    assert game.env.game.winner_team in (0, 1)
    assert sum(game.env.game.gwin) > 0
