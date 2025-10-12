import { globalMiddleware } from '../middleware/global.js'
import { routeMiddleware } from '../middleware/route.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'
import {
  addHTTPMiddleware,
  addMiddleware,
  pikkuMiddleware,
  wireHTTP,
} from '../../.pikku/pikku-types.gen.js'
import { httpMiddleware } from '../middleware/http.js'

// Global middleware applied to all tagged functions
addMiddleware('api', [globalMiddleware])

// HTTP-specific global middleware
addHTTPMiddleware([httpMiddleware])

// Route-pattern middleware
addHTTPMiddleware('/api/*', [routeMiddleware])

// Wire-level inline middleware (not exported, won't be in pikku-middleware.gen.ts)
const inlineWireMiddleware = pikkuMiddleware(
  async ({ middlewareChecker }, _interaction, next) => {
    middlewareChecker.log({ type: 'wire', name: 'inline', phase: 'before' })
    const result = await next()
    middlewareChecker.log({ type: 'wire', name: 'inline', phase: 'after' })
    return result
  }
)

// HTTP endpoint with:
// - Global tag middleware
// - HTTP-specific middleware
// - Route pattern middleware
// - Wire-level middleware (exported + inline)
// - Function-level middleware
wireHTTP({
  method: 'get',
  route: '/api/test',
  tags: ['api'],
  middleware: [wireMiddleware, inlineWireMiddleware],
  func: noOpFunction,
  auth: false, // No authentication required for this example
})

// HTTP endpoint with only function-level middleware to test isolation
wireHTTP({
  method: 'get',
  route: '/simple',
  func: noOpFunction,
  auth: false, // No authentication required for this example
})
