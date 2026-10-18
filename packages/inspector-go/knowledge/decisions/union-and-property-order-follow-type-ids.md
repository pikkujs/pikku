---
type: decision
title: Mapped-type property order follows Strada's type ids, not source order
description: A mapped type's properties are reordered by the ids of the key literals they came from, and the Go engine makes the checker calls TS makes so those ids come out in the same order
tags: [inspector-go, parity, schemas, typescript-go]
---

# Mapped-type property order follows Strada's type ids, not source order

> [!NOTE]
> Unions no longer follow ids: both engines sort a printed union by text (see
> `packages/inspector/knowledge/decisions/printed-unions-are-sorted-by-text.md`).
> The id sort below still decides property order, and still runs on unions
> before they are canonicalized.

typescript-go sorts a union's members by value; Strada sorts them by type id,
which is creation order. The same sort lays out a mapped type's properties when
it iterates a key union. Printed types become schemas, so the order reaches
`enum` and `required`, and through them every contract hash: a reordered enum is
a PKU861 "contract changed" at cutover.

`internal/tsutil` puts printed types back into id order (`TypeToString`,
`TypeToTypeNode`, `UnionTypesInIdOrder`). Ids are still allocated in creation
order in typescript-go, and literal types are interned, so the id of each
printed member recovers Strada's order exactly, `boolean` and mixed unions
included.

```decision
chosen: Sort by the id of the type each printed member came from, and make
  the checker calls TS makes (dslCtx.touchType) so ids are created in the same
  order.
rules-out:
  - Recovering order from source text (declaration or z.enum argument order)
  - Normalizing order away in the parity harness (the old
    tsgo-custom-type-ordering allow-list entry)
because: Source order is not what TS prints: a literal first mentioned
  elsewhere keeps that earlier position, and a source-order heuristic tried in
  internal/surface got unions wrong. A normalizer hides a difference that
  changes hashes.
```

> [!WARNING]
> Ids depend on check order. A Go sweep that skips a checker call TS makes, or
> makes one TS does not, moves literals and shows up as a reordered enum in a
> schema far away from the change. Strada's own order also moves with check
> order: Node and Bun runs of the TS reference can differ where readdir order
> changes it.
