---
type: decision
title: A list function's input schema is generated from ListInput, and generated unknown or never is PKU492
description: group_functions reads the real ListInput<F, S> off the pikkuListFunc call and CheckGenerated flags any unknown or never node the source did not declare
tags: [inspector-go, schemas, list-functions]
---

# A list function's input schema is generated from ListInput, and generated unknown or never is PKU492

`pikkuListFunc<F, Row, S>` returns a config typed `ListInput<F, S>` and `ListOutput<Row>`.
`internal/visit/group_functions_list.go` reads those two types from the resolved call
signature (`resolveListConfig`), so inferred and explicit generics agree, instead of merging
F into the top level. The input is registered as the custom type `ListInput<F, S>`, so
`filter` is a `$ref` to the recursive `Filter<F>` and `sort.column` is a `$ref` to a
`<Name>SortColumn` enum of the declared columns. Without S the input is
`Omit<ListInput<F, never>, 'sort'>` and the `sort` property is absent. An anonymous F is
registered as `<Name>Filter` so definition names stay stable, and the sort enum is its own
named type because a quoted union in a definition name cannot be resolved by the cfworker
validator. A type literal's symbol is named `\xfe__type` in typescript-go
(`ast.InternalSymbolNameType`), so "anonymous" is tested against that constant, not `"__type"`.

`LeafFilter` in core maps over `Required<F>` so an optional field does not leak `undefined`
into the `in` arrays, which would generate `{}`.

PKU492 (`GeneratedSchemaHasUnknown`, level `error`) runs in `schemas.CheckGenerated` right
after `GenerateAll`. It walks each function's input and output schema, following `$ref`, and
reports `{}` (unknown) and `not: {}` (never) with the function and a path (`.a`, `[]` for
items, `[*]` for open-map values). Explicit `unknown` or `any` in the source is allowed:
the checker walk (`declared_unknowns.go`) records those paths per schema name during
analysis, because the checker is released before schema generation, and Zod schemas report
theirs from `declaredUnknownPathsOfZod` (`src/vendor/declared-unknown-paths.ts`), run by both
the QuickJS runner and the Node fallback and returned as `declaredUnknowns` beside `typeText`.
The declared paths live on the visit context, not in the serialized state. A `never` is always
reported. An empty `properties` object is not a hole: `z.object({})` is a legitimate empty input.

It is `error`, not `critical`, so it blocks `pikku verify` and `--fail-on-error` but not a
plain `pikku all`.

**What this rules out:** a generated schema silently admitting anything, or nothing, where the
author did not write `unknown`.
