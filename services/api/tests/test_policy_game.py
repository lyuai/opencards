from opencards_api.game import PolicyGame


def _advance_to_human(game):
    view = game.view()
    while not view["waitingForHuman"] and not view["gameOver"]:
        view = game.act_ai()
    return view


def _play_legal(game, action):
    if action["kind"] == "pass":
        return game.act([], True)
    remaining = list(action["codes"])
    ids = []
    for card in game.view()["yourHand"]:
        code = card["id"].split(":")[-2]
        if code in remaining:
            ids.append(card["id"])
            remaining.remove(code)
    return game.act(ids, False)


def test_danzero_advice_is_an_engine_legal_action():
    game = PolicyGame(seed=42)
    before = _advance_to_human(game)
    advice = game.advise()

    assert before["turn"] == "south"
    assert before["waitingForHuman"] is True
    assert before["legalActions"]
    assert before["policy"]["name"] == "danzero"
    assert advice["provider"] == "policy:danzero"
    assert advice["confidence"] == 0  # checkpoint does not expose calibrated confidence
    assert advice["policy"]["legalActionCount"] > 1

    after = game.act(advice["cardIds"], not advice["cardIds"])
    assert len(after["history"]) >= 1
    assert [item["index"] for item in after["history"]] == list(range(1, len(after["history"]) + 1))


def test_playable_view_exposes_match_and_legal_actions():
    game = PolicyGame(seed=11, opponent_policy="random")
    view = _advance_to_human(game)
    assert view["dealNumber"] == 1
    assert view["yourLevel"] == "2"
    assert view["opponentLevel"] == "2"
    assert view["levelRank"] == "2"
    assert any(action["kind"] in {"play", "pass"} for action in view["legalActions"])
    play = next(action for action in view["legalActions"] if action["kind"] == "play")
    after = _play_legal(game, play)
    assert after["history"]


def test_complete_match_reaches_a_real_engine_result():
    game = PolicyGame(seed=7)
    decisions = 0
    while not game.env.is_over() and decisions < 10000:
        if game.view()["waitingForHuman"]:
            advice = game.advise()
            game.act(advice["cardIds"], not advice["cardIds"])
        else:
            game.act_ai()
        decisions += 1

    assert decisions < 10000
    assert game.env.is_over()
    assert game.env.game.winner_team in (0, 1)
    assert sum(game.env.game.gwin) > 0
    assert game.view()["winnerTeam"] in {"you", "opponent"}
    assert game.view()["lastDeal"]


def test_random_match_keeps_playing_after_the_human_goes_out():
    game = PolicyGame(seed=3, opponent_policy="random")
    decisions = 0
    saw_finished_human = False
    while not game.env.is_over() and decisions < 20000:
        view = game.view()
        if view["counts"]["south"] == 0 and not view["gameOver"]:
            saw_finished_human = True
        if view["waitingForHuman"]:
            _play_legal(game, view["legalActions"][0])
        else:
            game.act_ai()
        decisions += 1

    assert decisions < 20000
    assert game.env.is_over()
    assert game.view()["gameOver"] is True
    assert saw_finished_human or game.view()["winnerTeam"] in {"you", "opponent"}
