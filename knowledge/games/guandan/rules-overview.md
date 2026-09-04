---
id: guandan.rules.overview
game: guandan
kind: rule
ruleset: competition-draft-2026-09
status: draft
sources: []
reviewed_by: []
updated: 2026-09-04
---

# 掼蛋 rules overview

> [!warning] Research draft
> Regional and tournament variants differ. This note is a domain map, not yet a
> verified rules authority. A named ruleset must settle every variant below.

## Table and objective

Four players form two fixed partnerships, with partners seated opposite. Play
normally uses two standard 54-card decks. A hand combines shedding/climbing play
with a level rank that changes the strength of designated cards. The immediate
goal is to empty one's hand; partnership finishing order determines progression.

## What the executable ruleset must define

- deal size, first leader, direction, and how the next hand's leader is selected;
- current level rank, wild-card interpretation, and rank/suit ordering;
- every legal combination and its canonical comparison key;
- which bombs override ordinary combinations and how bomb categories compare;
- pass/lead reset behavior and when a trick is complete;
- first-through-fourth placement, tribute/return-card procedure, exemptions, and
  partnership level advancement;
- match victory condition and edge cases for disconnects or illegal exposure.

## Candidate combination taxonomy

The engine should model combinations as typed values rather than free text:
single, pair, triple, full house, straight, consecutive pairs, consecutive
triples, straight flush, rank bomb, and joker bomb. Exact lengths, wild-card
substitutions, and precedence remain explicit ruleset parameters.

## Coaching concepts

Strategy notes should distinguish facts visible to the player from inferred card
distributions. Useful concepts include partnership tempo, control cards, bomb
economy, signaling through legal actions, hand-shape preservation, opponent range,
and expected level gain. See [[strategy-model]].

## Verification checklist

- [ ] Select the first official/tournament ruleset to support.
- [ ] Record primary-source links and publication dates.
- [ ] Obtain review from at least two experienced players or one certified judge.
- [ ] Convert every combination and comparison rule into table-driven tests.
- [ ] Add examples for tribute, double-down finishes, and all bomb comparisons.
