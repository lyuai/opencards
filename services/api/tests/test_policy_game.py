from opencards_api.game import PolicyGame, _human_turn


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


def test_review_marks_covering_partner_and_following_coach():
    flush = ["StraightFlush", "8", ["C4", "C5", "C6", "C7", "C8"]]
    stay = ["PASS", "PASS", "PASS"]
    covered = _human_turn(4, flush, stay, 2, 12)
    assert covered["verdict"] == "压对家"
    assert covered["coveredPartner"] is True
    followed = _human_turn(5, stay, stay, 2, 12)
    assert followed["verdict"] == "一致"
    assert followed["followed"] is True


def test_review_records_a_human_turn_against_coach():
    game = PolicyGame(seed=42, opponent_policy="random")
    before = _advance_to_human(game)
    advice = game.advise()
    after = game.act(advice["cardIds"], not advice["cardIds"])
    review = after["review"]
    assert before["review"]["summary"]["yourTurns"] == 0
    assert review["summary"]["yourTurns"] == 1
    assert review["summary"]["followed"] == 1
    turn = review["deals"][-1]["yourTurns"][0]
    assert turn["followed"] is True
    assert turn["played"]["kind"] in {"play", "pass"}
    hands = review["deals"][-1]["openingHands"]
    assert set(hands) == {"south", "west", "north", "east"}
    assert all(len(cards) == 27 for cards in hands.values())
    assert len(turn["hand"]) == 27


def test_coach_passes_instead_of_covering_partner_with_a_straight_flush():
    flush = ["StraightFlush", "8", ["C4", "C5", "C6", "C7", "C8"]]
    stay = ["PASS", "PASS", "PASS"]
    state = {
        "actions": [flush, stay],
        "current_hand": ["C4", "C5", "C6", "C7", "C8", "S2", "H3", "D9"],
        "num_cards_left": [20, 17, 12, 22],
        "greaterAction": ["ThreeWithTwo", "3", ["S3", "H3", "D3", "S2", "H2"]],
        "greaterPos": 2,
    }
    refined = PolicyGame._refine_coach_action(state, flush)
    assert refined[0] == "PASS"
    assert "对家在控牌" in PolicyGame._coach_rationale(state, refined, flush)


def test_coach_still_covers_partner_when_that_empties_the_hand():
    flush = ["StraightFlush", "8", ["C4", "C5", "C6", "C7", "C8"]]
    stay = ["PASS", "PASS", "PASS"]
    state = {
        "actions": [flush, stay],
        "current_hand": ["C4", "C5", "C6", "C7", "C8"],
        "num_cards_left": [5, 17, 12, 22],
        "greaterAction": ["ThreeWithTwo", "3", ["S3", "H3", "D3", "S2", "H2"]],
        "greaterPos": 2,
    }
    assert PolicyGame._refine_coach_action(state, flush) == flush


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
    review = game.view()["review"]
    assert review["deals"]
    assert review["summary"]["yourTurns"] >= 1


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
