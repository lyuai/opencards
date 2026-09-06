# OpenCards AI Coach

OpenCards is an AI coaching platform for card games. It turns rules, annotated
matches, player styles, and user corrections into explainable practice sessions.

The previous Godot implementation is preserved on the `godot` branch. `main`
is the new web-first platform; a Unity client will consume the same APIs later.

## Repository layout

```text
apps/web/             Next.js coaching and replay interface
services/api/         Python API, DanZero policy, and local worker
third_party/rlcard-guandan/ Pinned game engine and pretrained DanZero model
packages/contracts/   Versioned JSON Schemas shared by every client
knowledge/            Obsidian-compatible rules and strategy vault
docs/                 Architecture, decisions, and delivery roadmap
```

## Start locally

Requirements: Node.js 22+, pnpm 10+, Python 3.9+, FFmpeg, and yt-dlp.

```sh
git submodule update --init
python3 -m venv services/api/.venv
services/api/.venv/bin/pip install -r services/api/requirements-dev.txt
pnpm install
pnpm dev
```

In another terminal:

```sh
npm run api
```

Start the first local worker in a third terminal:

```sh
npm run worker
```

Submit a Bilibili URL in the web interface. The job is persisted locally, leased
to the worker, and updated through heartbeat/completion endpoints. The worker first
uses `yt-dlp` to download publicly accessible media and FFmpeg to sample it locally.
It compares only the table ROI and returns timestamped change candidates without
running noisy full-frame OCR.

If direct download is unavailable, load the unpacked Chrome extension from
`extensions/browser`. It captures only the visible video region from the
authenticated browser and sends binary JPEG observations to the local worker at
`127.0.0.1:8787`. Browser cookies never leave the browser, and the worker does not
fabricate replay events from unverified observations.

Then open <http://localhost:3000>. The API listens on
<http://localhost:8080>; `GET /healthz` and `GET /v1/games` are available.

## AI coaching prototype

Copy `.env.example` to the ignored `.env.local` and add a server-side provider
key before starting the API. The Python service loads the root `.env.local` and
`.env` files; existing process environment variables take precedence. Never use a
`NEXT_PUBLIC_` variable for the provider key because that would expose it to the
browser.

The authoritative game and legal action list come from `rlcard-guandan`. All three
computer seats and the hint endpoint use its bundled pretrained DanZero Deep Monte
Carlo value network. The hint is matched back to the engine's exact `actionList`;
an out-of-list model action is rejected. No LLM or hand-written opening rule chooses
the move. Arena Copilot uses the configured OpenAI-compatible Responses API to
explain the policy output, but cannot replace it or invent a confidence score.

Run `npm run test:api` to execute both our HTTP/full-match regression suite and the
pinned upstream engine suite.

## Product principles

- Deterministic game engines decide legality; language models explain decisions.
- Every rule, replay, recommendation, and correction has provenance and a version.
- Raw observations, inferred actions, and reviewed knowledge are kept separate.
- User feedback is evaluated before promotion; it never silently rewrites rules.
- Web, future Unity, and automated players all speak the same replay protocol.

See [docs/architecture.md](docs/architecture.md) and
[docs/roadmap.md](docs/roadmap.md) for the implementation plan.
