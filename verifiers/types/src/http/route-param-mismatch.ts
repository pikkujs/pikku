/**
 * Type constraint: Route parameters must match function input types
 *
 * When a route contains parameters (e.g., /users/:id), the function's
 * input type must include those parameters.
 */

import { wireHTTP, pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

// Valid: Route params match function input type
wireHTTP({
  method: 'get',
  route: '/users/:id',
  func: pikkuSessionlessFunc<{ id: string }, void>(async ({}, {}, data) => {
    console.log(data.id)
  }),
})

// @ts-expect-error - Route has :id param but function input type is empty
wireHTTP({
  method: 'get',
  route: '/users/:id',
  func: pikkuSessionlessFunc<{}, void>(async () => {}),
})

// @ts-expect-error - Route has :id param but function input type has wrong property name
wireHTTP({
  method: 'get',
  route: '/users/:id',
  func: pikkuSessionlessFunc<{ userId: string }, void>(async () => {}),
})

// Valid: Multiple route params
wireHTTP({
  method: 'get',
  route: '/users/:userId/posts/:postId',
  func: pikkuSessionlessFunc<{ userId: string; postId: string }, void>(
    async () => {}
  ),
})

// @ts-expect-error - Missing one of the route params in type
wireHTTP({
  method: 'get',
  route: '/users/:userId/posts/:postId',
  func: pikkuSessionlessFunc<{ userId: string }, void>(async () => {}),
})

// Valid: Route param with additional query/body params
wireHTTP({
  method: 'post',
  route: '/users/:id',
  func: pikkuSessionlessFunc<{ id: string; name?: string }, void>(
    async () => {}
  ),
})
