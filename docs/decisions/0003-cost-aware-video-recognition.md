# ADR 0003: Cost-aware video recognition funnel

Status: accepted

## Decision

Video ingestion uses a local, staged recognition funnel. Full-rate video is never
sent to a multimodal model. The browser adapter crops to the player, samples at one
frame per second, and uploads JPEG bytes to the local worker. The worker computes a
small grayscale signature and rejects near-identical frames before storage.

Accepted change frames are processed by bounded-parallel local OCR. Future card
detectors operate on fixed regions of interest and produce candidates. The game
kernel resolves candidates against turn order, remaining counts, combination
legality, and the two-deck card inventory. A paid multimodal model is invoked only
for unresolved candidate sets; human review remains the final fallback.

## Cost controls

- Crop in the browser so irrelevant page pixels never cross the local boundary.
- Use binary JPEG rather than Base64 JSON.
- Keep only state changes, plus evidence on both sides of an ambiguous transition.
- Cache recognition by image digest and detector version.
- Batch low-confidence regions rather than entire frames.
- Run OCR and deterministic recognition locally on the Ticos-M4.
- Record retained frames, model calls, tokens, latency, and estimated job cost.
- Never infer invisible cards merely to obtain a complete-looking replay.

This architecture spends model tokens on uncertainty, not on video duration.
