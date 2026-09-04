---
id: guandan.rules.overview
game: guandan
kind: rule
ruleset: competition-draft-2026-09
status: draft
sources:
  - https://www.ttbz.org.cn/upload/file/20191223/6371270213033087899544901.pdf
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

Play proceeds counter-clockwise. With the player shown at South, the order is
South → East → North → West.

## Level rank and wild cards

A match starts at level 2 and progresses through A. The current level is commonly
described as “打几”; all eight cards whose rank equals that level are level cards.
For single-card and same-rank comparisons the order is big joker > small joker >
level card > A > K > … > 3 > 2, with the current level removed from its ordinary
position.

The two heart-suit level cards are 红心级牌, also called 红心参谋、逢人配 or
万能牌. Each may represent another ordinary rank/suit as needed to form a legal
combination, but may not represent a small or big joker. Wild-card substitutions
must be recorded explicitly in an executable play so comparison and replay remain
deterministic.

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
