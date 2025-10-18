/**
 * Type constraint: Query parameters must match function input types
 *
 * When query parameters are specified, the function's input type
 * must include those query parameters.
 */

import { wireHTTP, pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

// Valid: Query params match function input type
wireHTTP({
  method: 'get',
  route: '/search',
  query: ['q', 'limit'],
  func: pikkuSessionlessFunc<{ q: string; limit: string }, void>(
    async () => {}
  ),
})

// @ts-expect-error - Query params specified but function input type is empty
wireHTTP({
  method: 'get',
  route: '/search',
  query: ['q'],
  func: pikkuSessionlessFunc<{}, void>(async () => {}),
})

// @ts-expect-error - Query param 'limit' missing from function input type
wireHTTP({
  method: 'get',
  route: '/search',
  query: ['q', 'limit'],
  func: pikkuSessionlessFunc<{ q: string }, void>(async () => {}),
})

// Valid: Query params with route params
wireHTTP({
  method: 'get',
  route: '/users/:id',
  query: ['includeDetails'],
  func: pikkuSessionlessFunc<{ id: string; includeDetails: string }, void>(
    async () => {}
  ),
})

// @ts-expect-error - Missing query param in type when route params are present
wireHTTP({
  method: 'get',
  route: '/users/:id',
  query: ['includeDetails'],
  func: pikkuSessionlessFunc<{ id: string }, void>(async () => {}),
})
