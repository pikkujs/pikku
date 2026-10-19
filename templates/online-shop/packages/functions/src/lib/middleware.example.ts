import { z } from 'zod'
import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
  pikkuChannelMiddleware,
  pikkuChannelMiddlewareFactory,
  pikkuAgentMiddleware,
  addHTTPMiddleware,
  addGlobalMiddleware,
  addTagMiddleware,
  addChannelMiddleware,
  authBearer,
  authAPIKey,
  authCookie,
  cors,
  requireOrigin,
} from '#pikku/middleware'
import { pikkuFunc } from '#pikku/function'
import { wireHTTP } from '#pikku/http'
import {
  InvalidMiddlewareWireError,
  TooManyRequestsError,
} from '@pikku/core/errors'
import type { AgentStreamEvent } from '@pikku/core/agent'

// @snippet start firstMiddleware
export const responseTime = pikkuMiddleware(async ({ logger }, wire, next) => {
  const start = Date.now()

  // Call next middleware/function
  await next()

  // After function completes
  const duration = Date.now() - start
  logger.info(`Request completed in ${duration}ms`)

  // For HTTP, you can set headers
  wire.http?.response?.header('X-Response-Time', `${duration}ms`)
})
// @snippet end firstMiddleware

// @snippet start machineAuth
// @snippet start bearerAuth
// JWT mode (default) - decodes bearer tokens using the JWT service
export const jwtBearer = authBearer({})

// Static token mode - compares against a secret resolved per request
export const staticBearer = authBearer({
  token: {
    secretId: 'SHOP_API_TOKEN',
    userSession: { userId: 'system' },
  },
})
// @snippet end bearerAuth

// @snippet start apiKeyAuth
// Look for the API key in the x-api-key header
export const apiKeyFromHeader = authAPIKey({ source: 'header' })

// Look in a query parameter
export const apiKeyFromQuery = authAPIKey({ source: 'query' })

// Check both header and query
export const apiKeyFromAnywhere = authAPIKey({ source: 'all' })
// @snippet end apiKeyAuth

// @snippet start cookieAuth
export const sessionCookie = authCookie({
  name: 'session',
  expiresIn: { value: 30, unit: 'day' },
  options: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  },
})
// @snippet end cookieAuth
// @snippet end machineAuth

// @snippet start corsMiddleware
// Allow all origins
export const corsAnyOrigin = cors({})

// Specific origin with credentials
export const corsStorefront = cors({
  origin: 'https://shop.example.com',
  credentials: true,
})

// Multiple origins
export const corsStorefrontAndAdmin = cors({
  origin: ['https://shop.example.com', 'https://admin.example.com'],
})
// @snippet end corsMiddleware

// @snippet start requireOrigin
// Rejects with a 403 unless the request comes from this app's own origin
// or one of the origins listed here
export const storefrontOnly = requireOrigin({
  origins: ['https://shop.example.com'],
})
// @snippet end requireOrigin

// @snippet start middlewareFactory
// A real rate limiter belongs in a shared store; this keeps the example local.
const counts = new Map<string, number>()

export const rateLimit = pikkuMiddlewareFactory<{
  maxRequests: number
  windowMs: number
}>(({ maxRequests, windowMs }) =>
  pikkuMiddleware(async (_services, { http }, next) => {
    if (!http) return next()

    const ip = http.request?.header('x-forwarded-for') || 'unknown'
    const key = `ratelimit:${ip}`
    const count = counts.get(key) || 0

    if (count >= maxRequests) {
      throw new TooManyRequestsError()
    }

    counts.set(key, count + 1)
    setTimeout(() => counts.delete(key), windowMs).unref?.()
    return next()
  })
)

// Usage — patterns are anchored globs, so '/orders/*' covers the subtree
export const registerOrderRateLimit = () => {
  addHTTPMiddleware('/orders/*', [
    rateLimit({ maxRequests: 100, windowMs: 60000 }),
  ])
}
// @snippet end middlewareFactory

// @snippet start middlewareSignature
export const signatureExample = pikkuMiddleware(async (services, wire, next) => {
  // services: your singleton services (destructure what you need)
  // wire: transport-specific details (http, channel, queue, ...)
  // next: calls the next middleware, or the function itself
  await next()
})
// @snippet end middlewareSignature

// @snippet start authMiddleware
export const authMiddleware = pikkuMiddleware(
  async ({ jwt }, { http, setSession }, next) => {
    let token: string | undefined

    if (http) {
      token = http.request?.header('Authorization')?.replace('Bearer ', '')
    }

    if (token && jwt) {
      try {
        const payload = await jwt.decode<{ userId: string }>(token)
        await setSession?.({ userId: payload.userId })
      } catch (e) {
        // Invalid token - continue without session
      }
    }

    await next()
  }
)
// @snippet end authMiddleware

// Stand-ins for the middleware the scope examples below refer to.
export const securityHeaders = pikkuMiddleware(async (_services, { http }, next) => {
  http?.response?.header('X-Content-Type-Options', 'nosniff')
  await next()
})

export const apiKeyValidation = authAPIKey({ source: 'header' })

export const validatePriceChange = pikkuMiddleware(
  async ({ logger }, _wire, next) => {
    logger.info({ event: 'validate_price_change' })
    await next()
  }
)

export const auditPriceChange = pikkuMiddleware(async ({ logger }, _wire, next) => {
  await next()
  logger.info({ event: 'price_changed' })
})

// @snippet start functionMiddleware
export const updatePrice = pikkuFunc({
  input: z.object({ itemId: z.string(), priceCents: z.number().int().min(0) }),
  func: async ({ kysely }, { itemId, priceCents }) => {
    await kysely
      .updateTable('item')
      .set({ priceCents, updatedAt: new Date().toISOString() })
      .where('itemId', '=', itemId)
      .execute()
  },
  middleware: [validatePriceChange, auditPriceChange],
  title: 'Update an item price',
  tags: ['items'],
})
// @snippet end functionMiddleware

// @snippet start tagMiddleware
export const registerGlobalAndTagMiddleware = () => {
  // Every wiring runs this middleware
  addGlobalMiddleware([responseTime])

  // Any wiring tagged 'admin' runs this middleware
  addTagMiddleware('admin', [auditPriceChange])
}
// @snippet end tagMiddleware

// @snippet start channelMiddleware
export const traceAgentStream = pikkuChannelMiddleware<any, AgentStreamEvent>(
  async ({ logger }, event, next) => {
    logger.info({ event: 'agent_stream', type: event.type })
    await next(event)
  }
)
// @snippet end channelMiddleware

// @snippet start channelMiddlewareFactory
export const tagChannelEvents = pikkuChannelMiddlewareFactory(
  (channelName: string) =>
    async ({ logger }, event, next) => {
      logger.info({ event: 'channel_event', channel: channelName })
      await next(event)
    }
)
// @snippet end channelMiddlewareFactory

// @snippet start addChannelMiddleware
export const registerChannelMiddleware = () => {
  // Every channel tagged 'orders' runs this on its messages
  addChannelMiddleware('orders', [tagChannelEvents('order-status')])
}
// @snippet end addChannelMiddleware

// @snippet start agentMiddleware
export const countAgentCharacters = pikkuAgentMiddleware<{
  charCount: number
}>({
  modifyInput: async ({ logger }, { messages, instructions }) => {
    logger.info({ event: 'agent_input', messages: messages.length })
    return { messages, instructions }
  },
  modifyOutputStream: async (_services, { event, state }) => {
    if (event.type === 'text-delta') {
      state.charCount = (state.charCount ?? 0) + event.text.length
    }
    return event
  },
})
// @snippet end agentMiddleware

// @snippet start middlewareOrder
export const registerPriceRoute = () => {
  // Transport-specific - all HTTP routes
  addHTTPMiddleware('*', [securityHeaders])

  // Pattern-based - matches everything under /api/v1
  addHTTPMiddleware('/api/v1/*', [apiKeyValidation])

  // Wiring, with wire-specific middleware. updatePrice carries its own
  // function-level middleware (see above).
  wireHTTP({
    method: 'patch',
    route: '/api/v1/items/:itemId/price',
    func: updatePrice,
    middleware: [rateLimit({ maxRequests: 20, windowMs: 60000 })], // Wire-specific
  })
}
// @snippet end middlewareOrder

// @snippet start transportAware
export const transportAware = pikkuMiddleware(async (services, wire, next) => {
  if (wire.http) {
    // HTTP-specific: request, response
    const userAgent = wire.http.request?.header('User-Agent')
    wire.http.response?.header('X-Custom', 'value')
  }

  if (wire.channel) {
    // Channel-specific: channelId, openingData, send, close
    const channelId = wire.channel.channelId
    const openingData = wire.channel.openingData
  }

  if (wire.queue) {
    // Queue-specific: queueName, jobId, updateProgress, fail, discard
    const jobId = wire.queue.jobId
  }

  if (wire.scheduledTask) {
    // Scheduler-specific: name, schedule, executionTime, skip
    const schedule = wire.scheduledTask.schedule
  }

  await next()
})
// @snippet end transportAware

// @snippet start errorHandlerMiddleware
export const errorHandler = pikkuMiddleware(async ({ logger }, wire, next) => {
  try {
    await next()
  } catch (error) {
    logger.error({
      event: 'request_failed',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // For HTTP, you can set custom error responses
    wire.http?.response?.status(500)
    wire.http?.response?.header('X-Error-Id', crypto.randomUUID())

    // Re-throw to let Pikku handle it
    throw error
  }
})
// @snippet end errorHandlerMiddleware

// @snippet start conditionalCache
// A shared store the rest of the app writes into (a Map here for brevity)
const responseCache = new Map<string, unknown>()

export const conditionalCache = pikkuMiddleware(async (_services, wire, next) => {
  // Only cache GET requests
  const { request, response } = wire.http ?? {}
  if (!request || !response || request.method() !== 'get') {
    return await next()
  }

  const cacheKey = request.path()
  const cached = responseCache.get(cacheKey)

  if (cached !== undefined) {
    // Short-circuit - serve the cached response without calling next()
    response.json(cached)
    return
  }

  await next()
})
// @snippet end conditionalCache

// @snippet start cookieParser
export const cookieParser = pikkuMiddleware(async (_services, wire, next) => {
  if (!wire.http) {
    throw new InvalidMiddlewareWireError()
  }
  // Parse cookies from HTTP request
  await next()
})

// Apply only to HTTP routes
export const registerCookieParser = () => {
  addHTTPMiddleware('*', [cookieParser, securityHeaders])
}
// @snippet end cookieParser
