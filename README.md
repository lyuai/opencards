# OpenCards AI Coach

OpenCards is an AI coaching platform for card games. It turns rules, annotated
matches, player styles, and user corrections into explainable practice sessions.

The previous Godot implementation is preserved on the `godot` branch. `main`
is the new web-first platform; a Unity client will consume the same APIs later.

## Repository layout

```text
apps/web/             Next.js coaching and replay interface
services/api/         Go API and orchestration service
packages/contracts/   Versioned JSON Schemas shared by every client
knowledge/            Obsidian-compatible rules and strategy vault
docs/                 Architecture, decisions, and delivery roadmap
```

## Start locally

Requirements: Node.js 22+, pnpm 10+, and Go 1.24+.

```sh
pnpm install
pnpm dev
```

In another terminal:

```sh
cd services/api
go run ./cmd/api
```

Then open <http://localhost:3000>. The API listens on
<http://localhost:8080>; `GET /healthz` and `GET /v1/games` are available.

## AI coaching prototype

Copy `.env.example` to `.env`, set `OPENAI_API_KEY`, then export those values only
in the Go API process. Without a key, the same workflow runs in clearly labeled
demo mode. Never place an API key in `NEXT_PUBLIC_*` variables or commit `.env`.

The current vertical slice submits a 掼蛋 position and a deterministic list of
legal actions to `POST /v1/coach`. OpenAI Structured Outputs return the selected
action, rationale, assumptions, confidence, and knowledge IDs. The backend rejects
recommendations outside the supplied legal-action list. Corrections sent through
`POST /v1/feedback` enter a review queue rather than changing strategy directly.

## Product principles

- Deterministic game engines decide legality; language models explain decisions.
- Every rule, replay, recommendation, and correction has provenance and a version.
- Raw observations, inferred actions, and reviewed knowledge are kept separate.
- User feedback is evaluated before promotion; it never silently rewrites rules.
- Web, future Unity, and automated players all speak the same replay protocol.

See [docs/architecture.md](docs/architecture.md) and
[docs/roadmap.md](docs/roadmap.md) for the implementation plan.
