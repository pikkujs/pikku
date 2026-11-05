---
name: pikku-list-query
description: >-
  Paginated or infinite-scroll lists, "load more": pikkuListFunc, ListInput/ListOutput cursors, filter tree, usePikkuInfiniteQuery. Not small fixed lists (plain pikkuFunc plus usePikkuQuery).
installGroups: [core, client]
---

# Pikku List Queries

What to reach for and why. For how to call it, run this once: `pikku doc pikkuListFunc`.

## Agent Operating Procedure

1. Run `pikku all` BEFORE writing code; only NEW errors are yours to fix.
2. Write the backend with `pikkuListFunc`, never a bespoke `{items: [...]}` shape once the list can page.
3. Run `pikku all` to regenerate `usePikkuInfiniteQuery`.
4. Wire the frontend with `usePikkuInfiniteQuery`, not a hand-rolled `useState` page counter or a raw `useInfiniteQuery`. The generated hook resolves cursor plumbing from your function's types.
5. Validate with `pikku all`.

## The `pikkuListFunc` contract

A list function is a normal `pikkuFunc`/`pikkuSessionlessFunc` whose input/output conform to two shapes from `@pikku/core`:

```typescript
interface ListInput<
  F extends Record<string, unknown> = {},
  S extends string = never,
> {
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

The react-query codegen detects any RPC whose output includes `nextCursor` and generates an infinite-query hook for it. No manual wiring, no opt-in flag.

Rules for the function body:

- `input` is inferred as `ListInput<F>` from the generics. Never re-annotate it inline.
- **`limit` is caller-supplied on an exposed RPC, so it is CAPPED, not trusted:** `Math.min(Math.max(Math.trunc(input.limit ?? 20) || 20, 1), 100)`.
- An offset cursor is untrusted too: accept it only if `Number.isSafeInteger(parsed) && parsed >= 0`, else start at 0.
- Scope the query to the session with a `where`, and read filters with a helper like `leafEquals` below.
- Set `nextCursor` to `null` once `offset + rows.length` reaches the total.

A cursor can be any opaque string (a keyset value, an encoded timestamp) you can turn back into a query position.

## Frontend: `usePikkuInfiniteQuery`

Generated alongside `usePikkuQuery`/`usePikkuMutation` once `reactQueryFile` is configured (see the react-query wiring docs); no separate setup.

```tsx
import { usePikkuInfiniteQuery } from '.pikku/pikku-react-query.gen'

function ItemList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePikkuInfiniteQuery(
      'listItems',
      { limit: 20 } // never pass cursor here — the hook manages it
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

For scroll-triggered loading, put an `IntersectionObserver` sentinel at the end of the list that calls `fetchNextPage()` when it enters the viewport and `hasNextPage` is true. Don't poll on a scroll event handler.

## Common mistakes

- **Bespoke output shape** (`{items, total}` with no `nextCursor`): compiles, but disqualifies the function from `usePikkuInfiniteQuery`. Use `ListOutput<Row>`'s `rows` and `nextCursor` even if you don't need `filter`/`sort`/`search` yet; they're optional.
- **Fixed large `limit`** (e.g. `{ limit: 500 }` fetched once): silently truncates once the collection outgrows the cap. If a list can grow unbounded, page it from the start.
- **Passing `cursor` into `usePikkuInfiniteQuery`'s input**: the hook injects it per page; your input is the _base_ filter/limit shared by every page.

## `filter` is a TREE, not a bag of fields

`Filter<F>` is recursive: an **array** is an AND of its children, a **multi-key object** is an OR keyed by labels that mean nothing at evaluation time, and only a **single-key object** is a leaf. A leaf's value is the value itself or an operator object (`{ contains, in, gt, gte, lt, lte, not, startsWith, … }`).

So `'status' in input.filter` is `false` for `[{ status: 'open' }, { userId: 'u1' }]` (array), and code comparing the value breaks on `{ status: { in: ['open', 'held'] } }` (operator object). Both **silently return unfiltered rows**, handing back records the caller asked to exclude. Pikku ships no filter-to-SQL helper: the backend decides what it accepts, and has to say so.

Read exactly the shape you support, and refuse the rest:

```typescript
import type { Filter } from '@pikku/core/function'

/** The one shape this endpoint accepts: a single-key leaf with a plain value. */
function leafEquals<
  F extends Record<string, unknown>,
  K extends keyof F & string,
>(filter: Filter<F> | undefined, field: K): F[K] | undefined {
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

Supporting AND/OR or operators means walking the tree: recurse into the array and multi-key object, and map each leaf operator to its Kysely equivalent. Do that when the UI needs it; until then, throw on shapes you do not handle so a filter is never quietly dropped.
