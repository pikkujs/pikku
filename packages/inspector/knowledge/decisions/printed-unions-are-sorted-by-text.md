---
type: decision
title: Printed unions are sorted by text, with null and undefined last
description: Every type string entering the typesMap has its unions' members sorted alphabetically by both inspectors, and a union of literals given as CLI choices is sorted too
tags: [inspector, inspector-go, parity, schemas, contract-hash]
---

# Printed unions are sorted by text, with null and undefined last

The checker prints a union in the order its members were created. That order
follows whichever file happened to be checked first, so it is not a property
of the code: Node and Bun runs of the TypeScript inspector can disagree, and
typescript-go (which sorts members by value) disagrees with both. A printed
type becomes a schema, so the order reaches `enum`, and through it the
contract hash. `verifiers/workflows` showed it: `channels: Array<'email' |
'sms' | 'push' | 'slack'>` printed `"push"` first under TypeScript 6, because
an unrelated `assert.equal` call had created that literal early, and `"email"`
first under the native inspector.

`canonicalTypeString` (TS, `utils/canonical-type-string.ts`) and
`typesmap.CanonicalTypeString` (Go) run inside `addCustomType`, so no printed
type reaches state unsorted. They reorder union members only: object members,
parameters and whitespace stay byte for byte, so a type with no union in it
prints as it always did. Both run `canonical-type-string.cases.json`, so the
two ports cannot drift. A union of string literals given as CLI `choices`
is sorted the same way. An `enum`'s members keep their declaration order.

```decision
chosen: Sort every printed union by text, null and undefined last, in both
  engines, where a printed type enters the typesMap.
rules-out:
  - Reproducing TypeScript's creation order in the native inspector by making
    the same checker calls (it depends on checker internals typescript-go
    does not share, here a keyof any[] evaluation it never makes)
  - Ignoring order in the parity harness (the hash would still differ, and
    switching engines would report PKU861 for an unchanged function)
  - Sorting enum and type arrays inside the contract hash (every nullable
    field's type list would move, so every recorded versions.pikku.json would
    fail with FUNCTION_VERSION_MODIFIED; with canonical printing nothing
    checker-dependent is left for it to fix)
because: Creation order is an accident of check order, so the only order both
  engines and every runtime can agree on is one computed from the text.
```

> [!NOTE]
> A level the scanner cannot split safely keeps its order: a conditional type,
> a type parameter's constraint, a type predicate, anything with a top-level
> `?`, `:` or `=`. Only the brackets inside it are canonicalized. A schema
> generated from a union the user wrote keeps the user's order; it never
> depended on the checker.
