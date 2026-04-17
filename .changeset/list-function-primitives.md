---
'@pikku/core': patch
---

Add `ListInput<F, S>` / `ListOutput<Row>` / `Filter<F>` types for list-function primitives.

A "list function" is any Pikku function that returns a paginated collection. Adopting this shape unlocks a shared vocabulary across MCP tools, AI agents, typed RPC clients, and widget libraries — they all reason about cursor, filter, sort, and search uniformly.

These are purely structural constraints; no runtime behaviour change. A list function is still a normal `pikkuFunc` whose input extends `ListInput<F, S>` and output extends `ListOutput<Row>`.

```ts
import { pikkuFunc } from '#pikku'
import type { ListInput, ListOutput } from '@pikku/core'

export const listSessions = pikkuFunc<
  ListInput<{ status?: SessionStatus[] }, 'user' | 'status' | 'uploaded_at'>,
  ListOutput<Session>
>({ func: async ({ kysely }, input) => { /* ... */ } })
```

`Filter<F>` is a recursive AND/OR tree: arrays are AND of children, objects with label keys are OR of children, single-key objects with a field name from `F` are leaf predicates. Leaf operators mirror Prisma's vocabulary (`equals`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `not`, `mode`).

Follow-ups (separate PRs): `applyFilter<DB>(qb, filter)` Kysely helper, `usePikkuListQuery` in the CLI's react-query generator, first-class MCP list-tool shape.
