# Delivery roadmap

## Milestone 0 — foundation (current)

- [x] Preserve Godot implementation on `godot`.
- [x] Establish web/API/contracts/knowledge boundaries.
- [x] Define the replay envelope and coaching architecture.
- [ ] Add CI, local containers, PostgreSQL migrations, object storage, and job queue.

## Milestone 1 — 掼蛋 vertical slice

- Choose and cite one authoritative ruleset; complete expert review.
- Implement cards, combinations, comparison, turn flow, scoring, and property tests.
- Build manual replay editor/importer before automated video recognition.
- Deliver web playback with timeline, legal-action overlay, and rule citations.
- Ship baseline agents: legal/random, heuristic, and search; establish evaluation.

## Milestone 2 — coaching and correction

- Add hidden-information belief state and calibrated outcome estimates.
- Generate structured explanations from engine traces and verified knowledge.
- Add recommendation feedback, adjudication, regression suites, and version rollout.
- Add consent, retention, export, deletion, moderation, and audit controls.

## Milestone 3 — ingestion and player styles

- Integrate one permitted native replay source, then one video source adapter.
- Build OCR/CV reconstruction with confidence-aware human review.
- Learn anonymized style profiles and validate imitation quality on held-out matches.
- Add KARDS only after official-data/version/licensing feasibility is confirmed.

## Milestone 4 — Unity experience

- Generate Unity/C# protocol models and a headless integration harness.
- Implement identity, progression, hall, rooms, spectating, and coaching overlays.
- Add matchmaking, anti-cheat, moderation, observability, and live operations.

## Definition of coaching quality

Track rule legality (target 100%), replay reconstruction accuracy, action top-k
agreement with expert labels, outcome calibration, explanation citation coverage,
feedback overturn rate, and improvement in users' decisions over repeated sessions.
