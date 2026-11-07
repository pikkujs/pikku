---
type: overview
title: Decisions
description: Rules chosen in inspector-go, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->

- [The TypeScript inspector engine is retired; Go is the reference, Rust is selectable](the-typescript-inspector-engine-is-retired.md) — A native binary does all analysis and finalize (Go is the reference, Rust is selectable), @pikku/inspector keeps only its TypeScript-free parts and depends on no typescript package
- [Analysis and finalize meet at a serialized state](analysis-and-finalize-meet-at-a-serialized-state.md) — Everything that needs the checker runs in analysis and is written into the state as plain data; finalize reads only that data and never loads typescript
- [Mapped-type property order follows Strada's type ids, not source order](union-and-property-order-follow-type-ids.md) — A mapped type's properties are reordered by the ids of the key literals they came from, and the Go engine makes the checker calls TS makes so those ids come out in the same order
- [Zod schemas convert in QuickJS inside the binary, Node only as a fallback](zod-schemas-convert-in-quickjs.md) — esbuild bundles the schema modules with stubbed package imports and QuickJS runs the real z.toJSONSchema; a schema that touches a stub goes to Node, or is an error without it

<!-- /pikku:knowledge-index -->
