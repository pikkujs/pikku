/**
 * Type-level verification for generated React Query hooks.
 * This file is checked by `tsc --noEmit` — it must compile without errors.
 * It is NOT executed at runtime.
 */

import {
  usePikkuQuery,
  usePikkuMutation,
  usePikkuInfiniteQuery,
} from '#pikku/pikku-react-query.gen.js'

void usePikkuQuery('rpcTest', { in: 1 })
void usePikkuQuery('rpcTest', { in: 1 }, { staleTime: 5000 })

// @ts-expect-error — unknown RPC name must fail
usePikkuQuery('doesNotExist', {})

// @ts-expect-error — wrong input type must fail
usePikkuQuery('rpcTest', { wrong: 'field' })

const mutation = usePikkuMutation('rpcTest')
mutation.mutate({ in: 42 })

// @ts-expect-error — unknown RPC name must fail
usePikkuMutation('doesNotExist')

// @ts-expect-error — wrong input type must fail
mutation.mutate({ wrong: 'field' })

void usePikkuInfiniteQuery('listItems', { limit: 20 })

// @ts-expect-error — rpcTest output has no nextCursor, must fail
usePikkuInfiniteQuery('rpcTest', { in: 1 })

// @ts-expect-error — unknown RPC name must fail
usePikkuInfiniteQuery('doesNotExist', {})

// @ts-expect-error — wrong input type must fail
usePikkuInfiniteQuery('listItems', { wrong: 'field' })
