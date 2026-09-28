/**
 * Type constraint: a Zod field with `.default()` is optional for the caller
 *
 * The JSON Schema drops a defaulted field from `required`, so the validator
 * accepts a payload that omits it. The generated type has to say the same, or
 * a caller is forced to pass a value the server would have filled in.
 */

import type { RPCInvoke } from '#pikku/rpc/pikku-rpc-wirings-map.gen.js'

declare const invoke: RPCInvoke

// Valid: the defaulted field omitted
invoke('listPageRPC', { query: 'shoes' })

// Valid: the defaulted field passed
invoke('listPageRPC', { query: 'shoes', limit: 5 })

// @ts-expect-error — the field without a default is still required
invoke('listPageRPC', { limit: 5 })

// @ts-expect-error — the defaulted field keeps its type
invoke('listPageRPC', { query: 'shoes', limit: 'five' })
