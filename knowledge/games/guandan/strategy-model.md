---
id: guandan.strategy.model
game: guandan
kind: strategy
ruleset: competition-draft-2026-09
status: draft
sources:
  - https://crad.ict.ac.cn/cn/article/doi/10.7544/issn1000-1239.202220697
  - https://arxiv.org/abs/2602.00676
  - https://arxiv.org/abs/2408.02559
  - https://www.gameabc.com/subjectinfo/5_451_7.html
reviewed_by: []
updated: 2026-09-04
---

# 掼蛋 strategy model

Each recommendation should contain: observed state, legal alternatives, objective,
estimated outcomes, uncertainty, partner impact, cited principle, and a short
counterfactual explanation. Player profiles store tendencies—not identities or a
copy of one person's play—and must include sample size and confidence.

## Decision engine boundary

The language model is an analyst and explainer, not the authoritative playing
policy. The rules kernel generates legal actions. A learned policy or search model
should eventually estimate partnership outcome; until then the LLM compares legal
actions using observable state, history, and the evidence below, and must not claim
simulated win rates. SDMC and the OpenGuanDan benchmark are the principal technical
evidence for this separation. ^decision-engine-boundary

## Control-card economy (evaluation hypothesis)

Bombs and straight flushes are tempo/control resources, not merely ways to shed
more cards. Spending one should compare the concrete benefit now with future
control lost and with a lower-cost legal lead. This is not an executable
prohibition: endgame, rescuing a partner, or stopping an opponent can make early
use correct. It remains an expert-derived hypothesis until validated against
reviewed games or a trained policy. ^control-card-economy

## History and Theory of Mind

The coach may use public action history and remaining counts to infer partner and
opponent needs. It must label those conclusions as uncertain because hidden cards
remain unknown. The cited ToM study supports history-aware reasoning, not certainty
about another player's hand. ^tom-history
