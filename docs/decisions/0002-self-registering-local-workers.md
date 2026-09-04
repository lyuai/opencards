# ADR 0002: Self-registering local ingestion workers

Status: accepted

## Context

Authenticated video sources should be processed near the user's browser without
moving browser credentials into the web application. The web experience still
needs to submit work, observe progress, review evidence, and consume canonical
replays independently of the machine doing the extraction.

## Decision

OpenCards uses outbound-only local workers. A worker creates a stable random
installation ID, registers itself with the API on startup, leases compatible
jobs, renews its lease with heartbeats, checkpoints extraction, and uploads a
result. The current development machine is the first worker.

Worker identity is protocol metadata used for lease ownership, not a machine
management product. There is no fleet UI, remote administration, or manual
provisioning in the initial scope.

The initial job store is a local persisted file behind the Go API. The protocol
keeps persistence replaceable by PostgreSQL or Supabase Queues. Browser
credentials and raw captures remain local; only canonical replay data and
explicitly selected evidence are returned to the platform.

## Consequences

- The platform requires no inbound connection to a worker.
- Expired leases make interrupted jobs recoverable.
- Source adapters remain separate from replay and coaching contracts.
- Workers never fabricate events when capture or recognition is unavailable.
- Authentication and authorization must be strengthened before workers operate
  across the public internet; the prototype registration endpoint is local-only.
