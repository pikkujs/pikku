---
type: decision
title: The data-classification brand is an optional property
description: Making __classification__ required would break ordinary Kysely operands, so the brand only constrains values flowing out
tags: core
---

# The data-classification brand is an optional property

`Private<T>`, `Pii<T>` and `Secret<T>` in
`packages/core/src/data-classification.ts` brand a type with
`{ readonly __classification__?: 'private' | 'pii' | 'secret' }` — and the
marker is **optional on purpose**.

A required property would make a plain value unassignable to a branded column: a
`string` could no longer be passed where `Private<string>` is expected, which
breaks every ordinary Kysely query operand — `where('email', '=', someString)`,
inserts, and `.set(...)`. Making it optional keeps the brand structurally present
so static analysis still sees it, while letting plain values flow _in_. The
asymmetry is the point: the brand constrains what comes out of a query, not what
goes into one.

The consumer is `@pikku/inspector`, whose `findPiiPaths` reads the level union
directly and whose PKU910 output check detects the brand on a function's return
type. The brands are populated from the hand-authored `db/annotations.ts`
(`DbClassificationMap`) via `pikku db migrate`, which regenerates
`outDir/db/schema.d.ts` and `outDir/db/classification.gen.ts`.

A column's **at-rest form** is a separate axis making the opposite trade — see
[form is an axis of its own](core-column-form-is-an-axis-of-its-own.md). Its
brands are nominal and required, which is safe precisely because they land on
the INSERT/UPDATE side of the columns that opt in, rather than on the SELECT
side of every classified column. That is not an exception to the rule below; it
is a different rule about a different side.

**What this rules out:** making `__classification__` required to get stronger
guarantees, or replacing the optional property with a unique symbol / nominal
brand that behaves like a required one. Either change compiles here and then
breaks every generated Kysely call site in every downstream project. It also
rules out renaming the property or narrowing its literal union without updating
`findPiiPaths` in the inspector, which matches on both.
