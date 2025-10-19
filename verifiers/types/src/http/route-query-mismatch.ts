/**
 * Type constraint: Query parameters must match function input types
 *
 * When query parameters are specified, the function's input type
 * must include those query parameters.
 */

import { wireHTTP, pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

// Valid: Query params match function input type
wireHTTP({
  method: 'post',
  route: '/search',
  query: ['q', 'limit'],
  func: pikkuSessionlessFunc<{ q: string; limit: string }, void>(
    async () => {}
  ),
})

// @ts-expect-error - Query params don't match function input type
wireHTTP({
  method: 'post',
  route: '/search',
  query: ['q'],
  func: pikkuSessionlessFunc<{}, void>(async () => {}),
})

// Valid: Query params with route params
wireHTTP({
  method: 'get',
  route: '/users/:id',
  func: pikkuSessionlessFunc<{ id: string; includeDetails: string }, void>(
    async () => {}
  ),
})
