# Architecture

## Bounded contexts

1. **Game kernel** — deterministic state transition, legal-action generation,
   scoring, seeded simulation, and replay verification. Implement one adapter per
   game behind a common protocol; do not make one universal card-game rules DSL.
2. **Knowledge** — Git/Obsidian Markdown for human-readable rules and strategy,
   indexed by stable IDs, ruleset versions, provenance, and review state.
3. **Ingestion** — registered source adapters, media metadata, scene/OCR/card
   recognition, action reconstruction, confidence scoring, and a human review UI.
4. **Coaching** — candidate actions from the kernel, search/simulation or learned
   policy ranking, retrieval of relevant strategy, and an LLM explanation constrained
   to verified state and citations.
5. **Experience** — Next.js replay lab now; Unity hall/rooms later. Both consume the
   same API, realtime event stream, asset IDs, and replay schema.

## System shape

```text
Next.js / future Unity
        |
 Python API: auth, library, sessions, feedback, jobs
        |
  +-----+----------------+------------------+
  |                      |                  |
game adapters       coaching service   ingestion workers
  |                      |                  |
replay/events       retrieval + search  OCR/CV/transcript
  +---------- PostgreSQL / object storage --------+
                         |
                versioned Markdown vault
```

Start as a modular Python monolith plus asynchronous workers. The Python runtime
keeps the learned Guandan policies and game engine in-process. Split services only when
scale or deployment isolation demands it. Use PostgreSQL for transactional data,
object storage for source media/artifacts, and a queue for ingestion/simulation.
Embeddings are a derived index; Git Markdown remains the knowledge source.

## Video-to-player pipeline

1. Register a URL or uploaded, user-owned file and record permission/provenance.
2. Use official APIs, exports, captions, or embeds where available. Respect terms,
   robots, copyright, rate limits, and deletion requests; do not bypass DRM.
3. Segment the recording and extract board/card observations with timestamps.
4. Reconstruct candidate events using the game kernel as a constraint solver.
5. Route low-confidence or inconsistent events to human review.
6. Produce a replay JSON plus evidence links; only reviewed replays enter training.
7. Aggregate decisions into an anonymized style profile: action preferences,
   risk/tempo features, matchup context, sample size, and calibration confidence.
8. Distill recurring, evidence-supported concepts into draft Markdown notes.

Video alone cannot reliably reveal hidden information or player intent. The system
must label unknown state and never present inferred rationale as fact. Native replay
files and manual annotations should be prioritized over pixels.

## Replay and coaching session

The UI is event-sourced. A user can scrub to any event; the server restores a
snapshot and replays subsequent events. At a decision point the game adapter returns
legal actions. Agents may be scripted, search-based, or learned policies, but all
actions pass through the kernel. The coach ranks alternatives and returns:

- recommendation and goal;
- top alternatives with estimated outcome and uncertainty;
- rule/strategy citations;
- assumptions about hidden information;
- a reproducible analysis version and feedback target.

## Feedback learning loop

Feedback is not online prompt mutation. Store it as a versioned claim, reproduce
the position, validate the proposed action, cluster similar reports, and run a fixed
evaluation suite. Promote an accepted change through one of four paths: engine bug,
knowledge revision, new labeled example, or policy-training dataset. Canary the new
version and retain rollback/audit history. Private feedback is excluded from shared
training unless the user explicitly consents.

## API slices

- `GET /v1/games` and `/v1/games/{id}/rulesets`
- `POST /v1/imports`, `GET /v1/imports/{id}`
- `POST /v1/replays`, `GET /v1/replays/{id}`
- `POST /v1/sessions`, `POST /v1/sessions/{id}/actions`
- `POST /v1/analysis`, `GET /v1/analysis/{id}`
- `POST /v1/feedback`

Long-running imports and analyses return job IDs. Realtime session updates use
WebSocket or server-sent events. Every mutable request uses idempotency keys.

## Unity boundary

Unity is a presentation client, not a second game server. Define C# models from the
same JSON Schemas, keep authoritative simulation server-side, and allow an embedded
deterministic adapter only for responsiveness/offline practice. Hall, matchmaking,
rooms, inventory, progression, and cosmetics are separate from coaching correctness.
