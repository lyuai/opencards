# ADR 0003: Cost-aware video recognition funnel

Status: accepted

## Decision

Video ingestion uses a local, staged recognition funnel. Full-rate video is never
sent to a multimodal model. The worker first downloads publicly accessible media;
the browser adapter is only a fallback for authenticated sources. FFmpeg samples at
one frame per second, and the worker computes a table-region grayscale signature
to reject near-identical frames before storage.

Accepted change frames are processed by a card-specific rank/suit detector.
Full-frame OCR is intentionally avoided because it is slow and inaccurate on this
footage. Card detectors operate on fixed regions of interest and produce candidates. The game
kernel resolves candidates against turn order, remaining counts, combination
legality, and the two-deck card inventory. A paid multimodal model is invoked only
for unresolved candidate sets; human review remains the final fallback.

## Cost controls

- Prefer direct media download; crop in the browser only on the fallback path.
- Use binary JPEG rather than Base64 JSON.
- Keep only state changes, plus evidence on both sides of an ambiguous transition.
- Cache recognition by image digest and detector version.
- Batch low-confidence regions rather than entire frames.
- Run card-specific deterministic recognition locally on the Ticos-M4.
- Record retained frames, model calls, tokens, latency, and estimated job cost.
- Never infer invisible cards merely to obtain a complete-looking replay.

This architecture spends model tokens on uncertainty, not on video duration.
