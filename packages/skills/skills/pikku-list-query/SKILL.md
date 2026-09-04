---
name: pikku-list-query
description: >-
  Use when building a paginated/infinite-scroll list — any RPC that returns rows a user scrolls through (tables, card grids, search results). Covers pikkuListFunc, the ListInput/ListOutput cursor contract, and the generated usePikkuInfiniteQuery hook.
  TRIGGER when: user asks for infinite scroll, "load more", a paginated table/list/grid, or a list that could grow beyond a single page.
  DO NOT TRIGGER when: the list is small and fixed (e.g. a settings page with 5 items) — a plain pikkuFunc + usePikkuQuery returning a full array is simpler and correct there.
installGroups: [core, client]
---

# Pikku List Queries

## Agent Operating Procedure

1. Capture baseline. Run `pikku all` BEFORE writing code; only NEW errors are yours to fix.
2. Write the backend function with `pikkuListFunc` (below) — never a bespoke `{items: [...]}` shape once the list can page.
3. Run `pikku all` to regenerate `usePikkuInfiniteQuery` for the new function.
4. Wire the frontend with `usePikkuInfiniteQuery`, not a hand-rolled `useState` page counter and not a raw `useInfiniteQuery` — the generated hook already resolves cursor plumbing from your function's types.
5. Validate with `pikku all`.

## The `pikkuListFunc` contract

A list function is a normal `pikkuFunc`/`pikkuSessionlessFunc` whose input/output conform to two shared shapes from `@pikku/core`:

```typescript
interface ListInput<F extends Record<string, unknown> = {}, S extends string = never> {
  cursor?: string // opaque — echo back whatever you returned as nextCursor
  limit?: number // page size; server may cap it
  sort?: Array<{ column: S; direction: 'asc' | 'desc' }>
  filter?: Filter<F> // structured AND/OR tree, Prisma-style leaf operators
  search?: string // free-text search across server-chosen fields
}

interface ListOutput<Row> {
  rows: Row[]
  nextCursor: string | null // null = no more pages
  totalCount?: number // optional — skip when expensive to compute
}
```

Adopting this shape is what makes the function eligible for the generated `usePikkuInfiniteQuery` hook — the react-query codegen structurally detects any RPC whose output includes `nextCursor` and generates an infinite-query hook for it automatically. No manual wiring, no opt-in flag.

```typescript
import { pikkuListFunc } from '#pikku/function'

interface Item {
  id: string
  label: string
}

export const listItems = pikkuListFunc<{ status?: string }, Item>({
  expose: true,
  auth: true,
  readonly: true,
  description: 'List items for the signed-in user, paginated.',
  // `input` is inferred as ListInput<{ status?: string }> from the generics above —
  // never re-annotate it inline.
  func: async ({ kysely }, input, { session }) => {
    // `limit` is caller-supplied on an exposed RPC, so it is CAPPED, not trusted —
    // `ListInput` says "server may cap" and this is where that happens.
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 20) || 20, 1), 100)
    const parsed = input.cursor ? Number(input.cursor) : 0
    const offset = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0

    let query = kysely.selectFrom('item').where('userId', '=', session!.userId)
    const status = leafEquals(input.filter, 'status')
    if (status !== undefined) {
      query = query.where('status', '=', status)
    }

    const rows = await query.orderBy('createdAt', 'desc').offset(offset).limit(limit).execute()
    const nextOffset = offset + rows.length
    const totalCount = await query
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()

    return {
      rows: rows.map((r) => ({ id: r.id, label: r.label })),
      nextCursor: nextOffset < totalCount.count ? String(nextOffset) : null,
      totalCount: totalCount.count,
    }
  },
})
```

Cursor doesn't have to be a numeric offset — any opaque string works (a keyset value, an encoded timestamp, etc.), as long as you can turn it back into a query position on the next call.

## Frontend: `usePikkuInfiniteQuery`

Generated automatically alongside `usePikkuQuery`/`usePikkuMutation` once `reactQueryFile` is configured (see the react-query wiring docs) — no separate setup for list functions specifically.

```tsx
import { usePikkuInfiniteQuery } from '.pikku/pikku-react-query.gen'

function ItemList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = usePikkuInfiniteQuery(
    'listItems',
    { limit: 20 }, // never pass cursor here — the hook manages it
  )

  const rows = data?.pages.flatMap((page) => page.rows) ?? []

  return (
    <>
      {rows.map((row) => (
        <div key={row.id}>{row.label}</div>
      ))}
      {hasNextPage && (
        <button disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
          Load more
        </button>
      )}
    </>
  )
}
```

For scroll-triggered loading (rather than a button), pair it with an `IntersectionObserver` sentinel at the end of the list that calls `fetchNextPage()` when it enters the viewport and `hasNextPage` is true — don't poll on a scroll event handler.

## Common mistakes

- **Bespoke output shape** (`{items, total}` with no `nextCursor`) — compiles, but disqualifies the function from `usePikkuInfiniteQuery`; you're left hand-rolling pagination state. Use `ListOutput<Row>`'s field names (`rows`, `nextCursor`) even if you don't need `filter`/`sort`/`search` yet — they're optional.
- **Fixed large `limit` instead of real pagination** (e.g. `{ limit: 500 }` fetched once) — works until the collection outgrows the cap, then silently truncates. If a list can grow unbounded, page it from the start.
- **Passing `cursor` manually into `usePikkuInfiniteQuery`'s input argument** — the hook injects it into each page request itself; the input you pass is the _base_ filter/limit shared by every page.

## `filter` is a TREE, not a bag of fields

`Filter<F>` is recursive: an **array** is an AND of its children, a **multi-key object** is
an OR keyed by labels that mean nothing at evaluation time, and only a **single-key object**
is a leaf. A leaf's value is either the value itself or an operator object
(`{ contains, in, gt, gte, lt, lte, not, startsWith, … }`).

So `'status' in input.filter` answers `false` for `[{ status: 'open' }, { userId: 'u1' }]`
and for `{ status: { in: ['open', 'held'] } }` — the first because the filter is an array,
the second because the value is an operator object rather than the string the code then
compares. Both cases **silently return unfiltered rows**, which on a list endpoint means
handing back records the caller asked to exclude. Pikku ships no filter-to-SQL helper: the
backend decides what it accepts, and it has to say so.

Read exactly the shape you support, and refuse the rest rather than ignoring it:

```typescript
import type { Filter } from '@pikku/core/function'

/** The one shape this endpoint accepts: a single-key leaf with a plain value. */
function leafEquals<F extends Record<string, unknown>, K extends keyof F & string>(
  filter: Filter<F> | undefined,
  field: K,
): F[K] | undefined {
  if (!filter || Array.isArray(filter)) return undefined
  const keys = Object.keys(filter)
  if (keys.length !== 1 || keys[0] !== field) return undefined
  const value = (filter as Record<string, unknown>)[field]
  if (value !== null && typeof value === 'object') {
    throw new Error(`filter.${field} takes a value, not an operator object`)
  }
  return value as F[K]
}
```

Supporting AND/OR or operators means walking the tree properly — recurse into the array and
the multi-key object, and map each leaf operator to its Kysely equivalent. Do that when the
UI needs it; until then, throwing on the shapes you do not handle is what stops a filter
from being quietly dropped.
