---
type: overview
title: Decisions
description: Rules chosen in inspector-go, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->

- [After cutover @pikku/inspector keeps only its TypeScript-free parts](after-cutover-inspector-keeps-only-its-typescript-free-parts.md) — Deferred until TypeScript 7 has a compiler API. When the TypeScript engine is retired, @pikku/inspector keeps state types, ErrorCode, serialization and the other pure helpers, with no typescript dependency
- [Analysis and finalize meet at a serialized state](analysis-and-finalize-meet-at-a-serialized-state.md) — Everything that needs the checker runs in analysis and is written into the state as plain data; finalize reads only that data and never loads typescript
- [Both inspector engines stay, behind a switch, until TypeScript 7 has a compiler API](both-engines-stay-behind-a-switch-until-typescript-7.md) — The Go engine (native) is the default and the TypeScript inspector is selectable through one resolver; both are held byte-identical by the parity harness, and the TypeScript one is retired only once TypeScript 7 ships a stable API
- [Union and property order follow Strada's type ids, not source order](union-and-property-order-follow-type-ids.md) — Printed unions and mapped-type properties are reordered by the ids of the types they came from, and the Go engine makes the checker calls TS makes so those ids come out in the same order
- [Each TypeScript reference inspection runs in its own node process](the-typescript-reference-runs-in-its-own-node-process.md) — The parity harness and the roundtrip test never run two inspections in one process, and never run the reference under bun

<!-- /pikku:knowledge-index -->
