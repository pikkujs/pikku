//~ name: infinite-list-query
//~ title: Paginated/infinite-scroll list RPC (pikkuListFunc + usePikkuInfiniteQuery)
//~ entity: item
//~ when: A page needs to READ rows a user scrolls through and the collection can grow beyond one page (tables, card grids, search results). For a small fixed list, use `list-query` instead. Returning `nextCursor` is the whole opt-in — the generated usePikkuInfiniteQuery hook detects this output shape structurally, so pass `{ limit }` from the page and never a cursor.

// ===== FILE: packages/functions/src/functions/list-items.function.ts =====
import { pikkuListFunc } from '#pikku/function'

//~ pikkuListFunc<F, Row> is the canonical shape for a paginated list: input
//~ is ListInput<F> (cursor/limit/sort/filter/search — all optional except what
//~ you use), output is ListOutput<Row> ({rows, nextCursor, totalCount}). This
//~ exact output shape is what the codegen'd usePikkuInfiniteQuery hook detects
//~ structurally — no separate opt-in, just return `nextCursor`.
interface Item {
  id: string
  label: string
}

export const listItems = pikkuListFunc<{ status?: string }, Item>({
  expose: true, //~ generates the typed client RPC consumed by usePikkuInfiniteQuery
  readonly: true,
  auth: true,
  description: 'List items for the signed-in user, paginated.',
  //~ `input` is inferred as ListInput<{ status?: string }> from the generics
  //~ above — never re-annotate it inline (same rule as zod-typed pikkuFunc).
  func: async ({ kysely }, input, { session }) => {
    const limit = input.limit ?? 20
    //~ Cursor here is a plain numeric offset encoded as a string — any opaque
    //~ string works as long as you can turn it back into a query position.
    const offset = input.cursor ? Number(input.cursor) : 0

    //~ Swap `item` for your own table after adding it to db.ts + a db/sqlite
    //~ migration. ALWAYS scope to session.userId — never return another user's rows.
    //~ Shared filtered base for BOTH the page fetch and the count. $if adds the
    //~ optional filter in one chain (no mutable `let query`, no cast) — reference
    //~ the typed column 'status', never a raw sql`` fragment.
    const base = kysely
      .selectFrom('item')
      .where('userId', '=', session!.userId)
      .$if(!!input.filter?.status, (qb) => qb.where('status', '=', input.filter!.status!))

    const rows = await base.orderBy('createdAt', 'desc').offset(offset).limit(limit).execute()
    const totalCount = await base
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()

    const nextOffset = offset + rows.length
    return {
      rows: rows.map((r) => ({ id: r.id, label: r.name })),
      nextCursor: nextOffset < totalCount.count ? String(nextOffset) : null,
      totalCount: totalCount.count,
    }
  },
})

//~ Frontend: usePikkuInfiniteQuery is generated automatically once
//~ reactQueryFile is configured — no extra setup for list functions
//~ specifically. Pair the "Load more" trigger with an IntersectionObserver
//~ sentinel for true infinite scroll instead of a manual button if the UX
//~ calls for it.
//~
//~ import { usePikkuInfiniteQuery } from '.pikku/pikku-react-query.gen'
//~
//~ function ItemList() {
//~   const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = usePikkuInfiniteQuery(
//~     'listItems',
//~     { limit: 20 }, // never pass cursor here — the hook manages it
//~   )
//~   const rows = data?.pages.flatMap((page) => page.rows) ?? []
//~   return (
//~     <>
//~       {rows.map((row) => <div key={row.id}>{row.label}</div>)}
//~       {hasNextPage && (
//~         <button disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
//~           Load more
//~         </button>
//~       )}
//~     </>
//~   )
//~ }
