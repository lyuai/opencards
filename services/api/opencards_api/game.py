from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import threading
import uuid

import numpy as np
import guandan_rlcard
from guandan_rlcard.agents import GuandanAgent
from guandan_rlcard.baselines import get_agent_class
from guandan_rlcard.game.card_utils import cards2str


SEATS = {0: "south", 1: "east", 2: "north", 3: "west"}
SUITS = {"S": "♠", "H": "♥", "C": "♣", "D": "♦"}
COMBOS = {
    "Single": "single", "Pair": "pair", "Trips": "triple",
    "ThreeWithTwo": "full_house", "Straight": "straight",
    "ThreePair": "consecutive_pairs", "TwoTrips": "consecutive_triples",
    "StraightFlush": "straight_flush", "Bomb": "rank_bomb",
    "FourKings": "joker_bomb",
}


class HumanAgent(GuandanAgent):
    def step(self, state):
        return []


def _rank(code: str) -> str:
    value = code[1:]
    return {"T": "10", "B": "BJ", "R": "RJ"}.get(value, value)


def _card(code: str, identity: str) -> dict:
    joker = code[1:] in {"B", "R"}
    return {"id": identity, "rank": _rank(code), "suit": "★" if joker else SUITS[code[0]]}


def _cards(codes, prefix: str) -> list[dict]:
    seen = Counter()
    result = []
    for code in codes or []:
        seen[code] += 1
        result.append(_card(code, f"{prefix}:{code}:{seen[code]}"))
    return result


def _combo(action) -> dict | None:
    if not action or action[0] == "PASS":
        return None
    cards = action[2]
    return {"type": COMBOS.get(action[0], action[0].lower()), "size": len(cards), "power": 0}


def _move_analyses(history: list[dict]) -> list[dict]:
    analyses = []
    labels = {"south": "You", "east": "East", "north": "Partner", "west": "West"}
    for action in history:
        actor = labels[action["seat"]]
        if action["kind"] == "pass":
            summary = f"{actor} passed."
            impact = "They preserve their hand but surrender the chance to take control of this trick."
        else:
            combo = action.get("combination", {}).get("type", "play").replace("_", " ")
            cards = " ".join(f'{card["rank"]}{card["suit"]}' for card in action.get("cards", []))
            summary = f"{actor} played {cards} ({combo})."
            impact = "This becomes the active target; later seats must beat it with a legal higher play or pass."
        analyses.append({"index": action["index"], "seat": action["seat"], "summary": summary, "impact": impact})
    return analyses


class PolicyGame:
    def __init__(self, seed: int | None = None, opponent_policy: str = "danzero"):
        self.id = f"deal-{uuid.uuid4().hex}"
        self.created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        self.human_player_ids = [0]
        self.env = guandan_rlcard.make({"seed": seed, "perfect_info": False})
        random_state = np.random.RandomState(seed)
        if opponent_policy != "danzero":
            raise ValueError("only the pretrained DanZero opponent is currently available")
        Opponent = get_agent_class(opponent_policy)
        self.opponent_policy = opponent_policy
        self.agents = [HumanAgent(0, random_state)] + [Opponent(i, np.random.RandomState(None if seed is None else seed + i)) for i in range(1, 4)]
        self.env.set_agents(self.agents)
        self.env.reset()
        self.lock = threading.RLock()
        # A separate learned policy advises the human seat without taking it over.
        self.advisor_seed = seed
        self.advisor = Opponent(0, np.random.RandomState(seed))
        self._advice_cache_key: int | None = None
        self._advice_cache_action = None

    def view(self) -> dict:
        with self.lock:
            env = self.env
            current = env.get_player_id()
            state = env.get_state(current)
            trace = state.get("trace", [])
            history = []
            for index, (player, action) in enumerate(trace, start=1):
                is_pass = not action or action[0] == "PASS"
                entry = {"index": index, "seat": SEATS[int(player)], "kind": "pass" if is_pass else "play"}
                if not is_pass:
                    entry["cards"] = _cards(action[2], f"history-{index}")
                    entry["combination"] = _combo(action)
                history.append(entry)

            greater = state.get("greaterAction")
            greater_pos = state.get("greaterPos", -1)
            current_play = None
            if greater and greater[0] != "PASS" and greater_pos >= 0:
                current_play = {
                    "index": len(history), "seat": SEATS[int(greater_pos)], "kind": "play",
                    "cards": _cards(greater[2], "current"), "combination": _combo(greater),
                }
            hand_codes = state.get("current_hand", []) if current == 0 else cards2str(env.game.players[0].current_hand)
            counts = state.get("num_cards_left", [27, 27, 27, 27])
            rank_index = min(getattr(env.game, "cur_rank", 0), 12)
            rank = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"][rank_index]
            return {
                "id": self.id, "game": "guandan", "levelRank": rank,
                "yourSeat": "south", "yourHand": _cards(hand_codes, "hand"),
                "counts": {SEATS[i]: int(counts[i]) for i in range(4)},
                "turn": SEATS[current], "currentPlay": current_play,
                "history": history, "finished": [SEATS[p] for p in getattr(env.game.round, "result", []) if p >= 0],
                "gameOver": bool(env.is_over()), "createdAt": self.created_at,
                "policy": {"name": "DanZero", "kind": "learned", "model": "bundled-q-network"},
                "settings": {"seed": self.advisor_seed, "opponentPolicy": self.opponent_policy},
            }

    def act(self, card_ids: list[str], passed: bool) -> dict:
        with self.lock:
            if not self._waiting_for_human() or self.env.get_player_id() != 0:
                raise ValueError("现在不是你的回合")
            codes = [] if passed else [value.split(":")[-2] for value in card_ids]
            action = ["PASS", "PASS", "PASS"] if passed else self._find_action(codes)
            legal = self._match_action(action, self.env.get_state(0).get("actions", []))
            if legal is None:
                raise ValueError("动作不合法或已过期，请重新选择")
            next_state, _ = self.env.step(legal)
            self._sync_advisor_round(next_state)
            return self.view()

    def act_ai(self) -> dict:
        with self.lock:
            if self.env.is_over():
                raise ValueError("牌局已经结束")
            player = self.env.get_player_id()
            if player == 0:
                raise ValueError("当前应由玩家出牌")
            state = self.env.get_state(player)
            actions = state.get("actions", [])
            intent = self.agents[player].step(state) if actions else []
            legal = self._match_action(intent, actions) if actions else []
            if actions and legal is None:
                raise RuntimeError(f"DanZero seat {player} returned an illegal action")
            next_state, _ = self.env.step(legal)
            self._sync_advisor_round(next_state)
            return self.view()

    def _sync_advisor_round(self, next_state: dict) -> None:
        if next_state.get("round_completed"):
            self.advisor.reset()
            self._advice_cache_key = None
            self._advice_cache_action = None

    def copilot_context(self) -> dict:
        with self.lock:
            context = self.view()
            state = self.env.get_state(0)
            context["legalActions"] = [
                {"kind": "pass"} if action[0] == "PASS" else {
                    "kind": "play",
                    "cards": _cards(action[2], f"legal-{index}"),
                    "combination": _combo(action),
                }
                for index, action in enumerate(state.get("actions", []), start=1)
            ] if self.env.get_player_id() == 0 else []
            return context

    def _find_action(self, codes: list[str]):
        actions = self.env.get_state(0).get("actions", [])
        for action in actions:
            if action[0] != "PASS" and sorted(action[2]) == sorted(codes):
                return action
        raise ValueError("所选牌不是当前合法出牌")

    def advise(self) -> dict:
        with self.lock:
            if not self._waiting_for_human() or self.env.get_player_id() != 0:
                raise ValueError("AI 教练只能在你的回合分析")
            state = self.env.get_state(0)
            # DanZero maintains a model of the other seats across turns. Keep a
            # dedicated advisor alive for the match, while caching each turn so
            # repeated hint requests never replay the same observations.
            cache_key = len(state.get("trace", []))
            if self._advice_cache_key != cache_key:
                try:
                    self._advice_cache_action = self.advisor.step(state)
                except IndexError:
                    # Upstream DanZero assumes trace[0] exists after a player
                    # finishes. A fresh trick violates that assumption; reset
                    # its private opponent tracker and still run the learned
                    # value policy on the engine's complete current state.
                    self.advisor.reset()
                    self._advice_cache_action = self.advisor.step(state)
                self._advice_cache_key = cache_key
            action = self._advice_cache_action
            legal = self._match_action(action, state.get("actions", []))
            if legal is None:
                raise RuntimeError("DanZero returned an action outside the engine action list")
            passed = legal[0] == "PASS"
            cards = [] if passed else _cards(legal[2], "hand")
            # Resolve model card codes back to the stable IDs in the current hand.
            hand = self.view()["yourHand"]
            remaining = list(legal[2]) if not passed else []
            ids = []
            for card in hand:
                code = card["id"].split(":")[-2]
                if code in remaining:
                    ids.append(card["id"])
                    remaining.remove(code)
            label = "不出" if passed else "出 " + " ".join(f'{c["rank"]}{c["suit"]}' for c in cards)
            return {
                "provider": "policy:danzero", "recommendation": label,
                "cardIds": ids, "combination": _combo(legal),
                "rationale": "DanZero selected this action with its learned Deep Monte-Carlo value policy after reading the current public history and complete legal action set. The model does not expose calibrated action probabilities, so no confidence score is invented.",
                "alternatives": [],
                "assumptions": ["Opponent and partner hands are hidden", "The recommendation uses the bundled pretrained DanZero weights"],
                "confidence": 0,
                "moveAnalyses": _move_analyses(self.view()["history"]),
                "policy": {"name": "DanZero", "action": legal, "legalActionCount": len(state.get("actions", []))},
            }

    def _waiting_for_human(self) -> bool:
        if self.env.is_over() or self.env.get_player_id() != 0:
            return False
        return bool(self.env.get_state(0).get("actions"))

    @staticmethod
    def _match_action(intent, legal_actions):
        if not isinstance(intent, (list, tuple)) or not intent:
            return [] if not legal_actions else None
        for action in legal_actions:
            if action[0] != intent[0]:
                continue
            if action[0] == "PASS":
                return action
            if len(intent) >= 3 and sorted(action[2]) == sorted(intent[2]):
                return action
        return None


class GameStore:
    def __init__(self):
        self._games: dict[str, PolicyGame] = {}
        self._lock = threading.RLock()

    def create(self, seed: int | None = None, opponent_policy: str = "danzero") -> PolicyGame:
        game = PolicyGame(seed, opponent_policy)
        with self._lock:
            self._games[game.id] = game
        return game

    def get(self, game_id: str) -> PolicyGame | None:
        with self._lock:
            return self._games.get(game_id)
