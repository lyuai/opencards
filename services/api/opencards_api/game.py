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
RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
PLAYABLE_POLICIES = ("danzero", "base7", "random")
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


def _rank_label(index: int) -> str:
    if index > 12:
        return "A"
    return RANKS[max(int(index), 0)]


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


def _code(card: dict) -> str:
    return card["id"].split(":")[-2]


def _finish_kind(result: list[int]) -> str:
    if len(result) < 2:
        return "unknown"
    first_team = result[0] % 2
    if result[1] % 2 == first_team:
        return "double_up"
    if len(result) > 2 and result[2] % 2 == first_team:
        return "first_third"
    return "first_fourth"


def _level_gain(kind: str) -> int:
    return {"double_up": 3, "first_third": 2, "first_fourth": 1}.get(kind, 1)


def _move_analyses(history: list[dict]) -> list[dict]:
    analyses = []
    labels = {"south": "你", "east": "下家", "north": "对家", "west": "上家"}
    combo_labels = {
        "single": "单张", "pair": "对子", "triple": "三张", "full_house": "三带二",
        "straight": "顺子", "consecutive_pairs": "三连对", "consecutive_triples": "钢板",
        "straight_flush": "同花顺", "rank_bomb": "炸弹", "joker_bomb": "四王",
    }
    for action in history:
        actor = labels[action["seat"]]
        if action["kind"] == "pass":
            summary = f"{actor}不出。"
            impact = "留住了手牌，但这一轮不再争控牌。"
        else:
            combo = combo_labels.get(action.get("combination", {}).get("type", ""), "出牌")
            cards = " ".join(f'{card["rank"]}{card["suit"]}' for card in action.get("cards", []))
            summary = f"{actor}出了 {cards}（{combo}）。"
            impact = "这手成为当前要跟的牌，后面必须压过或者不出。"
        analyses.append({"index": action["index"], "seat": action["seat"], "summary": summary, "impact": impact})
    return analyses


class PolicyGame:
    def __init__(self, seed: int | None = None, opponent_policy: str = "danzero"):
        if opponent_policy not in PLAYABLE_POLICIES:
            raise ValueError(f"opponentPolicy must be one of {', '.join(PLAYABLE_POLICIES)}")
        self.id = f"deal-{uuid.uuid4().hex}"
        self.created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        self.human_player_ids = [0]
        self.env = guandan_rlcard.make({"seed": seed, "perfect_info": False})
        random_state = np.random.RandomState(seed)
        Opponent = get_agent_class(opponent_policy)
        self.opponent_policy = opponent_policy
        self.agents = [HumanAgent(0, random_state)] + [
            Opponent(i, np.random.RandomState(None if seed is None else seed + i))
            for i in range(1, 4)
        ]
        self.env.set_agents(self.agents)
        self.env.reset()
        self.lock = threading.RLock()
        self.advisor_seed = seed
        self._advisor = None
        self._advice_cache_key: int | None = None
        self._advice_cache_action = None
        self.last_deal: dict | None = None

    def view(self) -> dict:
        with self.lock:
            return self._view()

    def _view(self) -> dict:
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
        rank_list = list(getattr(env.game, "round").rank_list)
        waiting = self._waiting_for_human()
        legal_source = env.get_state(0) if waiting else {"actions": []}
        return {
            "id": self.id, "game": "guandan", "levelRank": _rank_label(getattr(env.game, "cur_rank", 0)),
            "yourSeat": "south", "yourHand": _cards(hand_codes, "hand"),
            "counts": {SEATS[i]: int(counts[i]) for i in range(4)},
            "turn": SEATS[current], "currentPlay": current_play,
            "history": history, "finished": [SEATS[p] for p in getattr(env.game.round, "result", []) if p >= 0],
            "gameOver": bool(env.is_over()), "createdAt": self.created_at,
            "waitingForHuman": waiting,
            "legalActions": self._legal_actions(legal_source.get("actions", [])),
            "dealNumber": int(getattr(env.game, "game_count", 1)),
            "playTeam": "you" if getattr(env.game.round, "play_team", 0) == 0 else "opponent",
            "yourLevel": _rank_label(rank_list[0] if rank_list else 0),
            "opponentLevel": _rank_label(rank_list[1] if len(rank_list) > 1 else 0),
            "winnerTeam": None if env.game.winner_team < 0 else ("you" if env.game.winner_team == 0 else "opponent"),
            "lastDeal": self.last_deal,
            "policy": {"name": self.opponent_policy, "kind": "learned" if self.opponent_policy == "danzero" else "baseline"},
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
            return self._apply_action(legal)

    def act_ai(self) -> dict:
        with self.lock:
            if self.env.is_over():
                raise ValueError("牌局已经结束")
            player = self.env.get_player_id()
            state = self.env.get_state(player)
            actions = state.get("actions", [])
            if player == 0 and actions:
                raise ValueError("当前应由玩家出牌")
            if player == 0:
                return self._apply_action([])
            intent = self.agents[player].step(state) if actions else []
            legal = self._match_action(intent, actions) if actions else []
            if actions and legal is None:
                raise RuntimeError(f"{self.opponent_policy} seat {player} returned an illegal action")
            return self._apply_action(legal)

    def _apply_action(self, action) -> dict:
        previous = self._deal_snapshot()
        next_state, _ = self.env.step(action)
        self._note_deal_change(previous)
        self._sync_advisor(next_state)
        return self._view()

    def _deal_snapshot(self) -> dict:
        game = self.env.game
        return {
            "number": int(game.game_count),
            "result": [p for p in getattr(game.round, "result", []) if p >= 0],
            "gwin": list(game.gwin),
            "yourLevel": int(game.team0_rank),
            "opponentLevel": int(game.team1_rank),
        }

    def _note_deal_change(self, previous: dict) -> None:
        game = self.env.game
        if game.game_count == previous["number"] and not game.is_over():
            return
        if game.gwin[0] > previous["gwin"][0]:
            winner_team = 0
        elif game.gwin[1] > previous["gwin"][1]:
            winner_team = 1
        else:
            winner_team = previous["result"][0] % 2 if previous["result"] else 0
        kind = _finish_kind(previous["result"])
        self.last_deal = {
            "number": previous["number"],
            "finished": [SEATS[p] for p in previous["result"]],
            "winnerTeam": "you" if winner_team == 0 else "opponent",
            "yourTeamWon": winner_team == 0,
            "kind": kind,
            "levelGain": _level_gain(kind),
            "yourLevel": _rank_label(game.team0_rank),
            "opponentLevel": _rank_label(game.team1_rank),
            "matchOver": bool(game.is_over()),
        }
        self._advice_cache_key = None
        self._advice_cache_action = None
        if self._advisor is not None:
            self._advisor.reset()

    def _sync_advisor(self, next_state: dict) -> None:
        if next_state.get("round_completed") and self._advisor is not None:
            self._advisor.reset()
            self._advice_cache_key = None
            self._advice_cache_action = None

    def copilot_context(self) -> dict:
        with self.lock:
            context = self._view()
            context["legalActions"] = self._legal_actions(self.env.get_state(0).get("actions", [])) if self.env.get_player_id() == 0 else []
            return context

    def _legal_actions(self, actions) -> list[dict]:
        result = []
        for index, action in enumerate(actions or [], start=1):
            if not action or action[0] == "PASS":
                result.append({"index": index, "kind": "pass"})
                continue
            result.append({
                "index": index,
                "kind": "play",
                "codes": list(action[2]),
                "cards": _cards(action[2], f"legal-{index}"),
                "combination": _combo(action),
            })
        return result

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
            cache_key = (int(self.env.game.game_count), len(state.get("trace", [])))
            if self._advice_cache_key != cache_key:
                advisor = self._get_advisor()
                try:
                    self._advice_cache_action = advisor.step(state)
                except IndexError:
                    advisor.reset()
                    self._advice_cache_action = advisor.step(state)
                self._advice_cache_key = cache_key
            action = self._advice_cache_action
            legal = self._match_action(action, state.get("actions", []))
            if legal is None:
                raise RuntimeError("建议动作不在当前合法出牌里")
            passed = legal[0] == "PASS"
            cards = [] if passed else _cards(legal[2], "hand")
            hand = self._view()["yourHand"]
            remaining = list(legal[2]) if not passed else []
            ids = []
            for card in hand:
                code = _code(card)
                if code in remaining:
                    ids.append(card["id"])
                    remaining.remove(code)
            label = "不出" if passed else "出 " + " ".join(f'{c["rank"]}{c["suit"]}' for c in cards)
            return {
                "provider": "policy:danzero", "recommendation": label,
                "cardIds": ids, "combination": _combo(legal),
                "rationale": "根据当前公开牌面和全部合法出牌，这一手更稳妥。对手和对家的手牌都看不到，只作参考。",
                "alternatives": [],
                "assumptions": ["对手和对家的手牌未知"],
                "confidence": 0,
                "moveAnalyses": _move_analyses(self._view()["history"]),
                "policy": {"name": "DanZero", "action": legal, "legalActionCount": len(state.get("actions", []))},
            }

    def _get_advisor(self):
        if self._advisor is None:
            Advisor = get_agent_class("danzero")
            self._advisor = Advisor(0, np.random.RandomState(self.advisor_seed))
        return self._advisor

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
