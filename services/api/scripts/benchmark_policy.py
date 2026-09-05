"""Reproducible learned-policy comparison with seat swapping."""

import argparse
import json
import random
import time

import numpy as np
import torch
import guandan_rlcard
from guandan_rlcard.baselines import get_agent_class


def run_side(team0, team1, episodes, seed):
    wins = [0, 0]
    deal_wins = [0, 0]
    for episode in range(episodes):
        value = seed + episode
        random.seed(value)
        np.random.seed(value)
        torch.manual_seed(value)
        classes = [get_agent_class(team0), get_agent_class(team1)]
        agents = [classes[i % 2](i, np.random.RandomState(value * 4 + i)) for i in range(4)]
        env = guandan_rlcard.make({"seed": value})
        env.set_agents(agents)
        env.run()
        wins[env.game.winner_team] += 1
        deal_wins[0] += env.game.gwin[0]
        deal_wins[1] += env.game.gwin[1]
    return {"team0": team0, "team1": team1, "episodes": episodes, "matchWins": wins, "dealWins": deal_wins}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", default="danzero")
    parser.add_argument("--baseline", default="base7")
    parser.add_argument("--episodes", type=int, default=20)
    parser.add_argument("--seed", type=int, default=20260905)
    args = parser.parse_args()
    started = time.perf_counter()
    first = run_side(args.policy, args.baseline, args.episodes, args.seed)
    second = run_side(args.baseline, args.policy, args.episodes, args.seed + args.episodes)
    policy_wins = first["matchWins"][0] + second["matchWins"][1]
    total = args.episodes * 2
    print(json.dumps({
        "policy": args.policy, "baseline": args.baseline, "seed": args.seed,
        "matches": total, "policyMatchWins": policy_wins,
        "policyMatchWinRate": policy_wins / total,
        "sides": [first, second], "elapsedSeconds": round(time.perf_counter() - started, 3),
    }, indent=2))


if __name__ == "__main__":
    main()
