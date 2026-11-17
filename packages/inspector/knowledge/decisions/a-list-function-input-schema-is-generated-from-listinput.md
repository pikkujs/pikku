---
type: decision
title: A list function's input schema is generated from ListInput, and generated unknown or never fails the build
description: add-functions resolves the real ListInput<F, S> and PKU492 flags any unknown or never node the source did not declare
tags: [inspector, schemas, list-functions]
---

# A list function's input schema is generated from ListInput, and generated unknown or never fails the build

`pikkuListFunc<F, Row, S>` returns a config typed `ListInput<F, S>` and `ListOutput<Row>`.
`add-functions.ts` reads those two types from the resolved call signature
(`resolveListConfigTypes`) instead of merging F into the top level. The input is registered
as the custom type `ListInput<F, S>`, so `filter` is a `$ref` to the recursive `Filter<F>`
and `sort.column` is a `$ref` to a `<Name>SortColumn` enum of the declared columns. Without S
the `sort` property is omitted. An anonymous F is registered as `<Name>Filter` so definition
names stay stable, and the sort enum is its own named type because a quoted union in a
definition name cannot be resolved by the cfworker validator.

`LeafFilter` in core maps over `Required<F>` so an optional field does not leak `undefined`
into the `in` arrays, which would generate `{}`.

PKU492 (`GENERATED_SCHEMA_HAS_UNKNOWN`, severity `error`) runs after schema generation
(`checkGeneratedSchemas`). It walks each function's input and output schema, following
`$ref`, and reports `{}` (unknown) and `not: {}` (never) with the function and schema path.
Explicit `unknown` or `any` in the source (TypeScript type or `z.unknown()` / `z.any()`) is
recorded in `typesMap.declaredUnknowns` and allowed. A `never` is always reported. An empty
`properties` object is not a hole: `z.object({})` is a legitimate empty input.

It is `error`, not `critical`, so it blocks `pikku verify` and `--fail-on-error` but not a
plain `pikku all`. The Go inspector engine has no equivalent check.

**What this rules out:** a generated schema silently admitting anything, or nothing, where the
author did not write `unknown`.
