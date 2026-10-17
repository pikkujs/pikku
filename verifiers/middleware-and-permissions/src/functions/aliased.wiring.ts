// Ensure HTTP metadata is loaded before calling wireHTTP
import '../../.pikku/http/pikku-http-wirings-meta.gen.js'

// #1461: a gate registered under another name is still a gate. The inspector
// used to match the literal identifier `addTagMiddleware`, so both of these
// registered nothing and the route ran ungated.
import { addTagMiddleware as guardTag } from '#pikku/middleware'
import * as middleware from '#pikku/middleware'
import { wireHTTP } from '#pikku/http'
import { tagMiddleware } from '../middleware/tag.js'
import { noOpFunction } from './no-op.function.js'

export const aliasedTagMiddleware = () =>
  guardTag('aliased', [tagMiddleware('aliased')])

export const namespacedTagMiddleware = () =>
  middleware.addTagMiddleware('namespaced', [tagMiddleware('namespaced')])

wireHTTP({
  method: 'get',
  route: '/aliased',
  tags: ['session', 'aliased', 'namespaced'],
  func: noOpFunction,
  auth: false,
})
