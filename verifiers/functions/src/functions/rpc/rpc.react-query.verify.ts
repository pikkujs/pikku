/**
 * Type-level verification for generated React Query hooks.
 * This file is checked by `tsc --noEmit` — it must compile without errors.
 * It is NOT executed at runtime.
 */

import {
  usePikkuQuery,
  usePikkuMutation,
} from '#pikku/pikku-react-query.gen.js'

// --- usePikkuQuery ---

// Valid: known RPC name with correct input
void usePikkuQuery('rpcTest', { in: 1 })

// Valid: with options
void usePikkuQuery('rpcTest', { in: 1 }, { staleTime: 5000 })

// @ts-expect-error — unknown RPC name must fail
usePikkuQuery('doesNotExist', {})

// @ts-expect-error — wrong input type must fail
usePikkuQuery('rpcTest', { wrong: 'field' })

// --- usePikkuMutation ---

// Valid: known RPC name
const mutation = usePikkuMutation('rpcTest')
// mutate should accept the correct input type
mutation.mutate({ in: 42 })

// @ts-expect-error — unknown RPC name must fail
usePikkuMutation('doesNotExist')

// @ts-expect-error — wrong input type must fail
mutation.mutate({ wrong: 'field' })
