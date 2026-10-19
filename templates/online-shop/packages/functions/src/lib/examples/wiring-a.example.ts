import { z } from 'zod'
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'
import { wireHTTP, wireHTTPRoutes, defineHTTPRoutes } from '#pikku/http'
import {
  pikkuMiddleware,
  addHTTPMiddleware,
  cors,
} from '#pikku/middleware'
import { addGlobalPermission, pikkuPermission } from '#pikku/auth'
import { NotFoundError, BadRequestError, PikkuError, addError } from '@pikku/core/errors'

// ---------------------------------------------------------------- HTTP: index

// @snippet start wa-http-first-function
export const getBook = pikkuSessionlessFunc({
  title: 'Fetch a book by ID',
  tags: ['books'],
  input: z.object({ bookId: z.string() }),
  func: async ({ kysely }, { bookId }) => {
    const book = await kysely
      .selectFrom('item')
      .selectAll()
      .where('itemId', '=', bookId)
      .executeTakeFirst()
    if (!book) {
      throw new NotFoundError()
    }
    return book
  },
})
// @snippet end wa-http-first-function

export const listBooks = pikkuSessionlessFunc({
  func: async ({ kysely }) => kysely.selectFrom('item').selectAll().execute(),
})

export const getAuthorBook = pikkuSessionlessFunc({
  input: z.object({ authorId: z.string(), bookId: z.string() }),
  func: async ({ kysely }, { bookId }) =>
    kysely.selectFrom('item').selectAll().where('itemId', '=', bookId).execute(),
})

export const createBook = pikkuSessionlessFunc({
  input: z.object({ title: z.string(), author: z.string() }),
  func: async (_services, data) => data,
})

export const login = pikkuSessionlessFunc({
  func: async () => ({ ok: true }),
})

export const streamProgress = pikkuSessionlessFunc({
  input: z.object({ jobId: z.string() }),
  func: async () => ({ done: true }),
})

export const auditMiddleware = pikkuMiddleware(async ({ logger }, _wire, next) => {
  logger.info('audit')
  await next()
})
export const setCookieMiddleware = pikkuMiddleware(async (_services, _wire, next) => {
  await next()
})

const requireBookOwner = pikkuPermission(async () => true)
const requireAdmin = pikkuPermission(async () => true)

// @snippet start wa-http-first-wire
export function wireBooks() {
  wireHTTP({
    method: 'get',
    route: '/books/:bookId',
    func: getBook,
  })
}
// @snippet end wa-http-first-wire

// @snippet start wa-http-permissions
export const deleteBook = pikkuFunc({
  input: z.object({ bookId: z.string() }),
  func: async ({ kysely }, { bookId }) => {
    await kysely.deleteFrom('item').where('itemId', '=', bookId).execute()
  },
  permissions: {
    owner: requireBookOwner,
    admin: requireAdmin,
  },
})
// @snippet end wa-http-permissions

// @snippet start wa-http-wiring-config
export function wireDeleteBook() {
  wireHTTP({
    // Required
    method: 'delete',
    route: '/books/:bookId',
    func: deleteBook,

    // Optional - Authentication
    auth: true, // Requires user session (default: true)

    // Optional - Middleware
    middleware: [auditMiddleware, setCookieMiddleware],
  })
}
// @snippet end wa-http-wiring-config

// @snippet start wa-http-route-params
export function wireParamRoutes() {
  wireHTTP({
    method: 'get',
    route: '/books/:bookId', // Single parameter
    func: getBook,
  })

  wireHTTP({
    method: 'get',
    route: '/authors/:authorId/books/:bookId', // Multiple parameters
    func: getAuthorBook,
  })
}
// @snippet end wa-http-route-params

// @snippet start wa-http-public-route
export function wirePublicBooks() {
  // Public endpoint - no auth required
  wireHTTP({
    method: 'get',
    route: '/books',
    func: listBooks,
    auth: false,
  })
}
// @snippet end wa-http-public-route

// @snippet start wa-http-wire-middleware
export function wireLogin() {
  wireHTTP({
    method: 'post',
    route: '/login',
    func: login,
    middleware: [setCookieMiddleware, auditMiddleware],
  })
}
// @snippet end wa-http-wire-middleware

const corsMiddleware = pikkuMiddleware(async (_services, _wire, next) => {
  await next()
})
const loggingMiddleware = pikkuMiddleware(async (_services, _wire, next) => {
  await next()
})
const adminAuthMiddleware = pikkuMiddleware(async (_services, _wire, next) => {
  await next()
})

// @snippet start wa-http-global-pattern-middleware
export function registerHttpMiddleware() {
  // Global - applies to all HTTP routes
  addHTTPMiddleware('*', [corsMiddleware, loggingMiddleware])

  // Pattern - applies to routes matching /admin/*
  addHTTPMiddleware('/admin/*', [adminAuthMiddleware])
}
// @snippet end wa-http-global-pattern-middleware

// @snippet start wa-http-sse-flag
export function wireProgress() {
  wireHTTP({
    method: 'get',
    route: '/jobs/:jobId/progress',
    func: streamProgress,
    sse: true, // Enables SSE
  })
}
// @snippet end wa-http-sse-flag

// @snippet start wa-http-data-flow-get
export function wireDataFlowGet() {
  // GET /books/123?includeAuthor=true
  wireHTTP({
    method: 'get',
    route: '/books/:bookId',
    func: getBook,
  })

  // Your function receives:
  // { bookId: '123', includeAuthor: true }
}
// @snippet end wa-http-data-flow-get

// @snippet start wa-http-data-flow-post
export function wireDataFlowPost() {
  // POST /books with body: { title: 'My Book', author: 'Jane' }
  wireHTTP({
    method: 'post',
    route: '/books',
    func: createBook,
  })

  // Your function receives:
  // { title: 'My Book', author: 'Jane' }
}
// @snippet end wa-http-data-flow-post

// @snippet start wa-http-custom-error
export class BookNotAvailableError extends PikkuError {}

// Register the error with HTTP status code
addError(BookNotAvailableError, {
  status: 409, // Conflict
  message: 'Book is currently unavailable',
})
// @snippet end wa-http-custom-error

// @snippet start wa-http-error-usage
export const borrowBook = pikkuFunc({
  title: 'Borrow a book',
  tags: ['books'],
  input: z.object({ bookId: z.string() }),
  func: async ({ kysely }, { bookId }) => {
    const book = await kysely
      .selectFrom('item')
      .selectAll()
      .where('itemId', '=', bookId)
      .executeTakeFirst()

    if (!book) {
      throw new NotFoundError('Book not found') // → 404
    }

    if (book.stock === 0) {
      throw new BookNotAvailableError('This book is already borrowed') // → 409
    }

    return kysely
      .updateTable('item')
      .set({ stock: book.stock - 1 })
      .where('itemId', '=', bookId)
      .returningAll()
      .executeTakeFirstOrThrow()
  },
})
// @snippet end wa-http-error-usage

// ------------------------------------------------------------ HTTP: groups

export const getTodo = pikkuSessionlessFunc({
  input: z.object({ todoId: z.string() }),
  func: async (_services, { todoId }) => ({ todoId }),
})
export const createTodo = pikkuSessionlessFunc({
  input: z.object({ title: z.string() }),
  func: async (_services, { title }) => ({ title }),
})
export const countTodos = pikkuSessionlessFunc({ func: async () => ({ count: 0 }) })
export const listTodos = pikkuSessionlessFunc({ func: async () => [] as string[] })
export const healthCheck = pikkuSessionlessFunc({ func: async () => ({ ok: true }) })
export const getStatus = pikkuSessionlessFunc({ func: async () => ({ up: true }) })

// @snippet start wa-http-define-routes
export const todosRoutes = defineHTTPRoutes({
  basePath: '/todos',
  auth: true,
  tags: ['todos'],
  routes: {
    list: { method: 'get', route: '', func: listTodos },
    get: { method: 'get', route: '/:todoId', func: getTodo },
    create: { method: 'post', route: '', func: createTodo },
    // A route can override the group's defaults
    publicCount: { method: 'get', route: '/count', func: countTodos, auth: false },
  },
})
// @snippet end wa-http-define-routes
export const authRoutes = defineHTTPRoutes({
  basePath: '/auth',
  auth: false,
  routes: {
    login: { method: 'post', route: '/login', func: login },
  },
})

// @snippet start wa-http-wire-route-groups
export function wireAppRoutes() {
  wireHTTPRoutes({
    routes: {
      todos: todosRoutes,
      auth: authRoutes,
    },
  })
}
// @snippet end wa-http-wire-route-groups

// @snippet start wa-http-base-path
export function wireVersionedRoutes() {
  wireHTTPRoutes({
    basePath: '/api/v1',
    routes: {
      todos: todosRoutes,
      auth: authRoutes,
    },
  })
  // Routes become: /api/v1/todos, /api/v1/auth/login, etc.
}
// @snippet end wa-http-base-path

// @snippet start wa-http-route-array
export function wireRouteArray() {
  wireHTTPRoutes({
    basePath: '/api',
    routes: [
      { method: 'get', route: '/health', func: healthCheck, auth: false },
      { method: 'get', route: '/status', func: getStatus, auth: false },
    ],
  })
}
// @snippet end wa-http-route-array

// ------------------------------------------------------------ HTTP: router

const requireAuth = pikkuMiddleware(async (_services, _wire, next) => {
  await next()
})
const auditLog = pikkuMiddleware(async (_services, _wire, next) => {
  await next()
})
const responseTime = pikkuMiddleware(async (_services, { http }, next) => {
  const start = Date.now()
  await next()
  if (http) {
    const duration = Date.now() - start
    http.response?.header('X-Response-Time', `${duration}ms`)
  }
})

// @snippet start wa-router-add-http-middleware
export function registerRouterMiddleware() {
  // All HTTP routes
  addHTTPMiddleware('*', [corsMiddleware, responseTime])

  // Every route under /admin/
  addHTTPMiddleware('/admin/*', [requireAuth, auditLog])
}
// @snippet end wa-router-add-http-middleware

// @snippet start wa-router-global-middleware
const permissiveCors = pikkuMiddleware(async (_services, { http }, next) => {
  if (http) {
    http.response?.header('Access-Control-Allow-Origin', '*')
    http.response?.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
  }
  await next()
})

const timing = pikkuMiddleware(async (_services, { http }, next) => {
  const start = Date.now()
  await next()
  if (http) {
    const duration = Date.now() - start
    http.response?.header('X-Response-Time', `${duration}ms`)
  }
})

export function registerGlobalMiddleware() {
  // Apply to all HTTP routes
  addHTTPMiddleware('*', [permissiveCors, timing])
}
// @snippet end wa-router-global-middleware

// @snippet start wa-router-pattern-middleware
const adminAuth = pikkuMiddleware(async ({ jwt }, { http, setSession }, next) => {
  if (!http) return await next()

  const token = http.request?.header('Authorization')
  if (!token) {
    http.response?.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const payload = await jwt!.decode<{ userId: string; role: 'customer' | 'support' | 'admin' }>(
      token.replace('Bearer ', '')
    )
    setSession?.(payload)
    await next()
  } catch (e) {
    http.response?.status(401).json({ error: 'Invalid token' })
  }
})

const hits = new Map<string, { count: number; resetAt: number }>()

const rateLimit = pikkuMiddleware(async (_services, { http }, next) => {
  if (!http) return await next()

  const ip = http.request?.header('x-forwarded-for') || 'unknown'
  const now = Date.now()
  const entry = hits.get(ip)

  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 })
    return await next()
  }

  if (entry.count >= 100) {
    http.response?.status(429).json({ error: 'Too many requests' })
    return
  }

  entry.count++
  await next()
})

export function registerPatternMiddleware() {
  // Admin routes need authentication
  addHTTPMiddleware('/admin/*', [adminAuth])

  // API routes are rate limited
  addHTTPMiddleware('/api/*', [rateLimit])
}
// @snippet end wa-router-pattern-middleware

const requireSession = pikkuPermission(async (_services, _data, { session }) => !!session)

// @snippet start wa-router-global-permission
export function registerGlobalPermission() {
  // Every function also requires a valid session
  addGlobalPermission([requireSession])
}
// @snippet end wa-router-global-permission

// @snippet start wa-router-jwt-auth
const jwtAuth = pikkuMiddleware(async ({ jwt }, { http, setSession }, next) => {
  if (!http) return await next()

  const token = http.request?.header('Authorization')?.replace('Bearer ', '')

  if (token) {
    try {
      const payload = await jwt!.decode<{ userId: string; role: 'customer' | 'support' | 'admin' }>(token)
      setSession?.({ userId: payload.userId })
    } catch (error) {
      // Invalid token - continue without session
      // Let function-level auth/permissions handle it
    }
  }

  await next()
})

export function registerJwtAuth() {
  // Apply to all protected routes
  addHTTPMiddleware('/api/*', [jwtAuth])
}
// @snippet end wa-router-jwt-auth

// @snippet start wa-router-request-logger
const requestLogger = pikkuMiddleware(async ({ logger }, { http }, next) => {
  if (!http) return await next()

  const start = Date.now()
  const method = http.request?.method()
  const url = http.request?.path()

  logger.info(`${method} ${url} - Started`)

  await next()

  const duration = Date.now() - start
  logger.info(`${method} ${url} - done (${duration}ms)`)
})

export function registerRequestLogger() {
  // Log all HTTP requests
  addHTTPMiddleware('*', [requestLogger])
}
// @snippet end wa-router-request-logger

// @snippet start wa-router-security-headers
const securityHeaders = pikkuMiddleware(async (_services, { http }, next) => {
  await next()

  if (http) {
    http.response?.header('X-Content-Type-Options', 'nosniff')
    http.response?.header('X-Frame-Options', 'DENY')
    http.response?.header('X-XSS-Protection', '1; mode=block')
    http.response?.header('Strict-Transport-Security', 'max-age=31536000')
  }
})

export function registerSecurityHeaders() {
  // Apply to all routes
  addHTTPMiddleware('*', [securityHeaders])
}
// @snippet end wa-router-security-headers

// @snippet start wa-cors-middleware
export function registerCors() {
  addHTTPMiddleware('*', [
    cors({ origin: ['https://app.example.com'], credentials: true }),
  ])
}
// @snippet end wa-cors-middleware

// -------------------------------------------------------------- HTTP: SSE

// @snippet start wa-sse-functions
export const processTodosProgress = pikkuSessionlessFunc({
  func: async (_services, _data, { channel }) => {
    const todos = ['a', 'b', 'c']
    const total = todos.length
    // @snippet start wa-sse-progress
    if (channel) {
      channel.send({ status: 'started', processed: 0, total })
      for (let i = 0; i < todos.length; i++) {
        channel.send({ status: 'processing', processed: i + 1, total })
      }
      channel.send({ status: 'complete', processed: total, total })
      channel.close()
    }

    // Returned to non-SSE callers of the same function
    return { status: 'complete', processed: total, total }
    // @snippet end wa-sse-progress
  },
})

export const todoStream = pikkuSessionlessFunc({
  func: async (_services, _data, { channel }) => {
    const todos = ['a', 'b', 'c']
    const timestamp = new Date().toISOString()
    // @snippet start wa-sse-periodic
    if (channel) {
      let count = 0
      const interval = setInterval(async () => {
        channel.send({ todos, timestamp, count: todos.length })
        if (++count >= 6) {
          clearInterval(interval)
          channel.close() // Close explicitly when the stream is finished
        }
      }, 5000)
    }

    // Returned to non-SSE callers
    return { todos, timestamp, count: todos.length }
    // @snippet end wa-sse-periodic
  },
})

// @snippet end wa-sse-functions

export const streamAgent = pikkuSessionlessFunc({
  func: async () => ({ ok: true }),
})

// @snippet start wa-sse-stream-protocol
export function wireAgentStream() {
  wireHTTP({
    method: 'get',
    route: '/agent/stream',
    func: streamAgent,
    sse: true,
    streamProtocol: 'agui',
  })
}
// @snippet end wa-sse-stream-protocol

// @snippet start wa-sse-wiring
export function wireSse() {
  wireHTTP({ method: 'get', route: '/todos/progress', func: processTodosProgress, sse: true })
  wireHTTP({ method: 'get', route: '/todos/stream', func: todoStream, sse: true })
}
// @snippet end wa-sse-wiring

// @snippet start wa-sse-dual-wiring
export function wireTodosProgress() {
  // Streamed
  wireHTTP({ method: 'get', route: '/todos/progress', func: processTodosProgress, sse: true })

  // Single response, same function
  wireHTTP({ method: 'get', route: '/todos/progress.json', func: processTodosProgress })
}
// @snippet end wa-sse-dual-wiring

export const initialState = { items: [] as string[] }
export const sseInitialMessage = pikkuSessionlessFunc({
  func: async (_services, _data, { channel }) => {
    // @snippet start wa-sse-initial-message
    // Good - first message arrives immediately
    if (channel) {
      channel.send(initialState)
      // ... stream updates
    }
    return initialState
    // @snippet end wa-sse-initial-message
  },
})

export const finiteStream = pikkuSessionlessFunc({
  func: async (_services, _data, { channel }) => {
    const maxUpdates = 3
    let count = 0
    const interval = setInterval(() => {
      count++
      // @snippet start wa-sse-finite-close
      // Finite stream - close when done
      if (count >= maxUpdates) {
        clearInterval(interval)
        channel?.close()
      }
      // Open-ended stream - omit channel.close(), client disconnects when done
      // @snippet end wa-sse-finite-close
    }, 1000)
  },
})

// ------------------------------------------------------- HTTP: fetch client

// @ts-expect-error — generated file, run `pikku gen` first
import { pikkuFetch } from '#pikku/pikku-fetch.gen.js'

// @snippet start wa-fetch-subscribe-sse
export function listenToProgress() {
  pikkuFetch.setServerUrl('http://localhost:4002')

  const stream = pikkuFetch.subscribeToSSE('/todos/progress', (event: unknown) => {
    console.log('Received:', event)
  })

  // Later, to stop listening
  stream.close()
}
// @snippet end wa-fetch-subscribe-sse

// @snippet start wa-openapi-wire
export const createTodoForUser = pikkuFunc({
  input: z.object({ userId: z.string(), title: z.string() }),
  func: async (_services, { title }) => ({ title }),
})

export function wireOpenApiExample() {
  wireHTTP({
    method: 'post',
    route: '/users/:userId/todos',
    func: createTodoForUser,
    auth: true,
    tags: ['todos'],
  })
}
// @snippet end wa-openapi-wire

// ===================================================================== MCP

import {
  pikkuMCPToolFunc,
  pikkuMCPResourceFunc,
  pikkuMCPPromptFunc,
  wireMCPResource,
  wireMCPPrompt,
} from '#pikku/mcp'
import { wireAddon } from '#pikku/addon'

// @snippet start wa-mcp-first-functions
// A tool: an action the model can take
export const createItemTool = pikkuMCPToolFunc<{ name: string; priceCents: number }>({
  description: 'Create a catalogue item',
  func: async (_services, { name, priceCents }, { rpc }) => {
    const item = await rpc.invoke('createItem', {
      categoryId: 'cat-001',
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      priceCents,
      stock: 0,
    })
    return [{ type: 'text', text: `Created ${item.name} (${item.itemId})` }]
  },
})

// A resource: data the model can read by URI
export const itemResource = pikkuMCPResourceFunc<{ itemId: string }>(
  async (_services, { itemId }, { rpc }) => {
    const item = await rpc.invoke('getItem', { itemId })
    return [{ uri: `shop://items/${itemId}`, text: JSON.stringify(item) }]
  }
)

// A prompt: a reusable conversation starter
export const recommendPrompt = pikkuMCPPromptFunc<{ category: string }>(
  async (_services, { category }) => [
    {
      role: 'user',
      content: { type: 'text', text: `Recommend three products in "${category}".` },
    },
  ]
)
// @snippet end wa-mcp-first-functions

// @snippet start wa-mcp-first-wiring
export function wireShopMcp() {
  wireMCPResource({
    uri: 'shop://items/{itemId}',
    title: 'Shop Item',
    description: 'Retrieve a single shop item by ID',
    func: itemResource,
  })

  wireMCPPrompt({
    name: 'recommend',
    description: 'Ask for product recommendations in a category',
    func: recommendPrompt,
  })
}
// @snippet end wa-mcp-first-wiring

// @snippet start wa-mcp-typed-resource
export const itemDocs = pikkuMCPResourceFunc<{ section: string }>(
  async (_services, data, { mcp }) => {
    return [{ uri: mcp.uri!, text: `Docs for ${data.section}` }]
  }
)
// @snippet end wa-mcp-typed-resource

// @snippet start wa-mcp-search-resource
export const searchItems = pikkuMCPResourceFunc<{ query: string; limit?: number }>(
  async ({ kysely }, data) => {
    const results = await kysely
      .selectFrom('item')
      .select(['itemId', 'name', 'description'])
      .where('name', 'like', `%${data.query}%`)
      .limit(data.limit ?? 20)
      .execute()

    return results.map((r) => ({
      uri: `shop://items/${r.itemId}`,
      text: `${r.name}: ${r.description ?? ''}`,
    }))
  }
)
// @snippet end wa-mcp-search-resource

// @snippet start wa-mcp-review-prompt
export const itemReviewPrompt = pikkuMCPPromptFunc<{ itemId: string; context: string }>(
  async ({ kysely }, data) => {
    const item = await kysely
      .selectFrom('item')
      .selectAll()
      .where('itemId', '=', data.itemId)
      .executeTakeFirstOrThrow()

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Review this listing:\n\nItem: ${item.name}\n\nContext: ${data.context}\n\nDescription:\n${item.description}`,
        },
      },
    ]
  }
)
// @snippet end wa-mcp-review-prompt

// @snippet start wa-mcp-wiring-config
export function wireReviewMcp() {
  wireMCPResource({
    uri: 'items/{itemId}',
    title: 'Item Information',
    description: 'Get an item by ID',
    func: itemResource,
  })

  wireMCPPrompt({
    name: 'itemReview',
    description: 'Generate a listing review prompt',
    func: itemReviewPrompt,
  })
}
// @snippet end wa-mcp-wiring-config

// @snippet start wa-mcp-error
export class ResourceNotFoundError extends PikkuError {}

addError(ResourceNotFoundError, {
  status: 404,
  mcpCode: -32601, // MCP "method not found"
  message: 'The requested resource does not exist',
})
// @snippet end wa-mcp-error

// @snippet start wa-mcp-error-usage
export const getItemResource = pikkuMCPResourceFunc<{ itemId: string }>(
  async ({ kysely }, data) => {
    const item = await kysely
      .selectFrom('item')
      .selectAll()
      .where('itemId', '=', data.itemId)
      .executeTakeFirst()

    if (!item) {
      throw new ResourceNotFoundError(`Item not found: ${data.itemId}`)
    }

    return [
      {
        uri: `shop://items/${item.itemId}`,
        text: JSON.stringify(item),
      },
    ]
  }
)
// @snippet end wa-mcp-error-usage

// ----------------------------------------------------------- MCP: tools

// @snippet start wa-mcp-tool-first
// Domain function - reusable across all transports
export const adjustStock = pikkuFunc({
  title: 'Adjust the stock level of an item',
  tags: ['items'],
  input: z.object({ itemId: z.string(), stock: z.number().int().min(0) }),
  output: z.object({ itemId: z.string(), stock: z.number() }),
  func: async ({ kysely, logger }, data) => {
    logger.info(`Adjusting stock for ${data.itemId}`)

    await kysely
      .updateTable('item')
      .set({ stock: data.stock })
      .where('itemId', '=', data.itemId)
      .execute()

    return { itemId: data.itemId, stock: data.stock }
  },
})

// MCP adapter - just formats the response for AI agents
export const adjustStockMCP = pikkuMCPToolFunc<{ itemId: string; stock: number }>({
  description: 'Set the stock level of a shop item',
  func: async (_services, data, { rpc }) => {
    await rpc.invoke('updateItem', data)

    return [
      {
        type: 'text',
        text: `Updated stock for ${data.itemId}`,
      },
    ]
  },
  title: 'Adjust stock (MCP adapter)',
  tags: ['mcp', 'items'],
})
// @snippet end wa-mcp-tool-first

// @snippet start wa-mcp-expose-true
export const listLowStock = pikkuFunc({
  description: 'List items that are running low on stock',
  mcp: true,
  input: z.object({ threshold: z.number().default(5) }),
  func: async ({ kysely }, { threshold }) => {
    return {
      items: await kysely
        .selectFrom('item')
        .select(['itemId', 'name', 'stock'])
        .where('stock', '<=', threshold)
        .execute(),
    }
  },
})
// @snippet end wa-mcp-expose-true

// @snippet start wa-mcp-addon-all
export function wireStripeTools() {
  wireAddon({
    name: 'stripe',
    package: '@pikku/addon-stripe',
    scopes: ['payments:charge'],
    mcp: true,
  })
}
// @snippet end wa-mcp-addon-all

// @snippet start wa-mcp-addon-list
export function wireStripeToolList() {
  wireAddon({
    name: 'stripe',
    package: '@pikku/addon-stripe',
    scopes: ['payments:charge'],
    mcp: ['customerGet', 'invoiceList'],
  })
}
// @snippet end wa-mcp-addon-list

// @snippet start wa-mcp-complex-domain
export const processOrder = pikkuFunc({
  title: 'Process an order end-to-end',
  tags: ['orders'],
  input: z.object({ orderId: z.string() }),
  func: async ({ logger }, data, { rpc }) => {
    logger.info(`Processing order ${data.orderId}`)

    const order = await rpc.invoke('getOrder', { orderId: data.orderId })

    if (order.status === 'pending') {
      await rpc.invoke('cancelOrder', { orderId: data.orderId })
    }

    return { orderId: order.orderId, status: order.status }
  },
})
// @snippet end wa-mcp-complex-domain

// @snippet start wa-mcp-complex-adapter
export const processOrderMCP = pikkuMCPToolFunc<{ orderId: string }>({
  description: 'Process an order end-to-end',
  func: async (_services, data, { rpc }) => {
    const order = await rpc.invoke('getOrder', data)

    return [
      {
        type: 'text',
        text: `Order ${order.orderId}\nStatus: ${order.status}\nTotal: ${order.totalCents}`,
      },
    ]
  },
  title: 'Process an order (MCP adapter)',
  tags: ['mcp', 'orders'],
})
// @snippet end wa-mcp-complex-adapter

// @snippet start wa-mcp-image-tool
export const generateChartMCP = pikkuMCPToolFunc<{ datasetId: string }>({
  description: 'Generate a chart from a dataset',
  func: async (_services, data, { rpc }) => {
    const chartData = await rpc.invoke('generateChart', data)

    return [
      {
        type: 'text',
        text: 'Generated chart:',
      },
      {
        type: 'image',
        data: chartData.base64Image,
      },
    ]
  },
  title: 'Generate chart (MCP adapter)',
  tags: ['mcp', 'charts'],
})
// @snippet end wa-mcp-image-tool

// @snippet start wa-mcp-tool-config
export const processOrderTool = pikkuMCPToolFunc<{ orderId: string }>({
  // Required
  description: 'Process an order end-to-end',
  func: async (_services, data, { rpc }) => {
    const result = await rpc.invoke('getOrder', data)
    return [{ type: 'text', text: `Processed order ${result.orderId}` }]
  },

  // Optional
  name: 'processOrder', // defaults to the export name
  title: 'Process Order',
  summary: 'Fetches the order and reports its status',
  middleware: [auditMiddleware],
  tags: ['orders', 'admin'],
})
// @snippet end wa-mcp-tool-config

// ------------------------------------------------------- MCP: resources

// @snippet start wa-mcp-res-first
// Domain function - reusable across all transports
export const getUserInfo = pikkuFunc({
  title: 'Get user information by ID',
  tags: ['users'],
  input: z.object({ userId: z.string() }),
  func: async ({ kysely }, data) => {
    const user = await kysely
      .selectFrom('user')
      .select(['id', 'name', 'email'])
      .where('id', '=', data.userId)
      .executeTakeFirst()

    if (!user) {
      throw new NotFoundError(`User not found: ${data.userId}`)
    }

    return { userId: user.id, name: user.name, email: user.email }
  },
})

// MCP adapter - just formats the response for AI agents
export const getUserInfoMCP = pikkuMCPResourceFunc<{ userId: string }>(
  async (_services, data, { rpc }) => {
    const user = await rpc.invoke('getUserInfo', data)

    return [
      {
        uri: `user://${user.userId}`,
        text: JSON.stringify(user),
      },
    ]
  }
)
// @snippet end wa-mcp-res-first

// @snippet start wa-mcp-res-first-wiring
export function wireUserResource() {
  wireMCPResource({
    uri: 'user/{userId}',
    title: 'User Information',
    description: 'Retrieve user information by user ID',
    func: getUserInfoMCP,
    tags: ['user', 'profile'],
  })
}
// @snippet end wa-mcp-res-first-wiring

// @snippet start wa-mcp-res-static
export const getCategoriesMCP = pikkuMCPResourceFunc<void>(
  async (_services, _data, { rpc }) => {
    const categories = await rpc.invoke('listCategories')

    return [
      {
        uri: 'shop://categories',
        text: JSON.stringify(categories),
      },
    ]
  }
)
// @snippet end wa-mcp-res-static

// @snippet start wa-mcp-res-param-adapter
export const searchItemsMCP = pikkuMCPResourceFunc<{ query: string; limit?: number }>(
  async (_services, data, { rpc }) => {
    const { items } = await rpc.invoke('listItems', {
      search: data.query,
      ...(data.limit === undefined ? {} : { limit: data.limit }),
    })

    // Return multiple resource objects
    return items.map((item) => ({
      uri: `shop://items/${item.itemId}`,
      text: item.description ?? item.name,
    }))
  }
)
// @snippet end wa-mcp-res-param-adapter

// @snippet start wa-mcp-res-wiring-config
export function wireSearchResource() {
  wireMCPResource({
    // Required
    uri: 'docs/search/{query}',
    title: 'Search Documentation',
    description: 'Search project documentation',
    func: searchItemsMCP,

    // Optional
    middleware: [auditMiddleware],
    tags: ['docs', 'search'],
  })
}
// @snippet end wa-mcp-res-wiring-config

// @snippet start wa-mcp-res-errors-domain
export const getFile = pikkuFunc({
  title: 'Get file contents',
  tags: ['files'],
  input: z.object({ path: z.string() }),
  output: z.object({ path: z.string(), content: z.string() }),
  func: async ({ kysely }, data) => {
    if (!data.path || data.path.includes('..')) {
      throw new BadRequestError('Invalid file path')
    }

    const file = await kysely
      .selectFrom('item')
      .select(['slug', 'description'])
      .where('slug', '=', data.path)
      .executeTakeFirst()

    if (!file) {
      throw new NotFoundError(`File not found: ${data.path}`)
    }

    return { path: file.slug, content: file.description ?? '' }
  },
})
// @snippet end wa-mcp-res-errors-domain

// @snippet start wa-mcp-res-errors-adapter
export const getFileMCP = pikkuMCPResourceFunc<{ path: string }>(
  async (_services, data, { rpc }) => {
    const file = await rpc.invoke('getFile', data)

    return [
      {
        uri: `file://${file.path}`,
        text: file.content,
      },
    ]
  }
)
// @snippet end wa-mcp-res-errors-adapter

// @snippet start wa-mcp-res-multi-adapter
export const getRelatedItemsMCP = pikkuMCPResourceFunc<{ itemId: string; categorySlug: string }>(
  async (_services, data, { rpc }) => {
    const main = await rpc.invoke('getItem', { itemId: data.itemId })
    const related = await rpc.invoke('listItems', {
      categorySlug: data.categorySlug,
      limit: 5,
    })

    // Return the main item and all related items
    return [
      { uri: `shop://items/${main.itemId}`, text: JSON.stringify(main) },
      ...related.items.map((item) => ({
        uri: `shop://items/${item.itemId}`,
        text: JSON.stringify(item),
      })),
    ]
  }
)
// @snippet end wa-mcp-res-multi-adapter

// ------------------------------------------------------- MCP: prompts

// @snippet start wa-mcp-prompt-static
export const staticPromptGenerator = pikkuMCPPromptFunc<unknown>(async () => {
  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `This is a static prompt example. It does not take any arguments and simply returns a predefined message.`,
      },
    },
  ]
})
// @snippet end wa-mcp-prompt-static

// @snippet start wa-mcp-prompt-dynamic
export const dynamicPromptGenerator = pikkuMCPPromptFunc<{
  topic: string
  complexity: 'beginner' | 'intermediate' | 'advanced'
  includeExamples?: boolean
}>(async ({ logger }, { topic, complexity, includeExamples = false }) => {
  logger.info(`Generating content for: ${topic} (${complexity})`)

  let content = `# Progressive Enhancement for ${topic}\n\n`

  switch (complexity) {
    case 'beginner':
      content += `This is a beginner-friendly introduction to ${topic}.\n\n`
      content += `Start with the basics and build up your understanding gradually.\n`
      break
    case 'intermediate':
      content += `This is an intermediate guide to ${topic}.\n\n`
      content += `Assumes some familiarity with related concepts.\n`
      break
    case 'advanced':
      content += `This is an advanced discussion of ${topic}.\n\n`
      content += `Deep dive into complex scenarios and edge cases.\n`
      break
  }

  if (includeExamples) {
    content += `\n## Examples\n\n`
    content += `Here are some practical examples for ${topic}:\n`
    content += `- Example 1: Basic implementation\n`
    content += `- Example 2: Advanced use case\n`
    content += `- Example 3: Common pitfalls to avoid\n`
  }

  return [
    {
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: content,
      },
    },
  ]
})
// @snippet end wa-mcp-prompt-dynamic

// @snippet start wa-mcp-prompt-register
export function wirePrompts() {
  wireMCPPrompt({
    name: 'getStaticResource',
    description: 'A static prompt that returns a predefined message',
    func: staticPromptGenerator,
  })

  wireMCPPrompt({
    name: 'dynamicPromptGenerator',
    description:
      'Generate educational content with progressive complexity and optional examples',
    func: dynamicPromptGenerator,
    tags: ['education', 'content', 'progressive', 'examples'],
  })
}
// @snippet end wa-mcp-prompt-register

// @snippet start wa-mcp-prompt-multi
export const multiMessagePrompt = pikkuMCPPromptFunc<{ topic: string; complexity: string }>(
  async (_services, { topic, complexity }) => {
    return [
      {
        role: 'system',
        content: {
          type: 'text',
          text: 'You are a helpful assistant specialized in web development.',
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please explain ${topic} in a ${complexity} way.`,
        },
      },
    ]
  }
)
// @snippet end wa-mcp-prompt-multi

// ================================================================ Workflows

import {
  pikkuWorkflowFunc,
  pikkuWorkflowGraph,
  WorkflowCancelledException,
} from '#pikku/workflow'
import { pikkuAgent } from '#pikku/agent'
import { defineCredential } from '#pikku/auth'
import { listOrders } from '../../functions/orders/list-orders.function.js'
import { getOrder } from '../../functions/orders/get-order.function.js'

// @snippet start wa-wf-replay
export const replayExample = pikkuWorkflowFunc(async (_services, _data, { workflow }) => {
  const createUser = async () => ({ id: 'u1' })
  const sendEmail = async () => ({ sent: true })
  const sendReminder = async () => ({ sent: true })

  // First execution
  await workflow.do('Step 1', async () => createUser()) // Executes
  await workflow.do('Step 2', async () => sendEmail()) // Executes
  await workflow.sleep('Wait', '5min') // Schedules timer

  // After 5 minutes (replay)
  await workflow.do('Step 1', async () => createUser()) // SKIPPED (cached)
  await workflow.do('Step 2', async () => sendEmail()) // SKIPPED (cached)
  await workflow.sleep('Wait', '5min') // SKIPPED (cached)
  await workflow.do('Step 3', async () => sendReminder()) // Executes
})
// @snippet end wa-wf-replay

// @snippet start wa-wf-quick-example
export const orderFollowUpWorkflow = pikkuWorkflowFunc<
  { orderId: string; userId: string },
  { success: boolean }
>(async (_services, data, { workflow }) => {
  // Step 1: Load the order (RPC step - runs in queue worker)
  const order = await workflow.do('Load the order', 'getOrder', {
    orderId: data.orderId,
  })

  // Step 2: Generate a message (inline step - runs immediately)
  const message = await workflow.do(
    'Generate follow-up message',
    async () => `Thanks for your order ${order.orderId}!`
  )

  // Step 3: Wait 5 minutes before sending the confirmation
  await workflow.sleep('Wait 5 minutes before confirmation', '5min')

  // Step 4: Send the confirmation (RPC step - runs in queue worker)
  await workflow.do('Send confirmation', 'sendOrderConfirmation', {
    orderId: data.orderId,
    userId: data.userId,
  })

  return { success: message.length > 0 }
})
// @snippet end wa-wf-quick-example

// @snippet start wa-wf-start
export const startCheckoutRun = pikkuFunc({
  func: async (_services, _data, { rpc }) => {
    const { runId } = await rpc.startWorkflow('checkoutWorkflow', {
      basketId: 'basket-123',
      userId: 'user-456',
      shippingAddress: { line1: '1 High St', city: 'London', postcode: 'SW1A 1AA', country: 'GB' },
    })
    return { runId }
  },
})
// @snippet end wa-wf-start

// ---- steps

export const stepSyntaxExamples = pikkuWorkflowFunc(async (_services, data: { userId: string; orderId: string }, { workflow }) => {
  // @snippet start wa-wf-rpc-step-syntax
  const result = await workflow.do(
    'Step description',
    'getOrder',
    { orderId: data.orderId },
    {
      retries: 3, // Optional: number of retry attempts (default: 5)
      retryDelay: '1s', // Optional: fixed delay; omitted → exponential backoff
    }
  )
  // @snippet end wa-wf-rpc-step-syntax

  // @snippet start wa-wf-rpc-step-example
  // Call the getOrder RPC function
  const order = await workflow.do('Load the order', 'getOrder', {
    orderId: data.orderId,
  })

  // With retry options
  const payment = await workflow.do(
    'Process payment',
    'chargeCard',
    { orderId: data.orderId, totalCents: 10000 },
    {
      retries: 2, // Retry up to 2 times (3 total attempts)
      retryDelay: '5s', // Wait 5 seconds between retries
    }
  )
  // @snippet end wa-wf-rpc-step-example

  // @snippet start wa-wf-inline-step-syntax
  const inline = await workflow.do(
    'Step description',
    async () => {
      // Your code here
      return { value: 42 }
    },
    {
      retries: 3, // Optional: number of retry attempts (default: 5)
      retryDelay: '1s', // Optional: fixed delay; omitted → exponential backoff
    }
  )
  // @snippet end wa-wf-inline-step-syntax

  const crmApi = {
    createUser: async (_u: unknown) => ({ id: 'crm-1' }),
    createProfile: async (_u: unknown) => ({ id: 'an-1' }),
  }
  const user = { email: 'a@b.c', name: 'A' }

  // @snippet start wa-wf-inline-step-example
  // Create user in CRM system
  const crmUser = await workflow.do('Create user in CRM system', async () => {
    return await crmApi.createUser({
      email: user.email,
      name: user.name,
      source: 'signup',
    })
  })

  // With retry options for flaky external API
  const analyticsUser = await workflow.do(
    'Create analytics profile',
    async () => {
      return await crmApi.createProfile(user)
    },
    {
      retries: 2, // Retry up to 2 times if API fails
      retryDelay: '3s', // Wait 3 seconds between retries
    }
  )
  // @snippet end wa-wf-inline-step-example

  // @snippet start wa-wf-inline-caching
  // First execution
  const cachedCrmUser = await workflow.do(
    'Create user in CRM',
    async () => crmApi.createUser(user) // ✓ Creates user in CRM
  )
  await workflow.sleep('Wait 5min', '5min')

  // After sleep (replay), the same step is SKIPPED and
  // uses the cached cachedCrmUser instead of creating a second one
  // @snippet end wa-wf-inline-caching

  // @snippet start wa-wf-sleep-examples
  await workflow.sleep('Wait 5 minutes before sending email', '5min')
  await workflow.sleep('Wait 30 seconds before retry', '30s')
  await workflow.sleep('Wait 1 day before follow-up', '1440min')
  // @snippet end wa-wf-sleep-examples

  return { result, order, payment, inline, crmUser, analyticsUser, cachedCrmUser }
})

// @snippet start wa-wf-workflow-step-wire
export const processPayment = pikkuSessionlessFunc({
  input: z.object({ amount: z.number(), userId: z.string() }),
  output: z.object({ success: z.boolean() }),
  func: async ({ logger }, data, { workflowStep }) => {
    // Access workflow context
    if (workflowStep) {
      const attempt = workflowStep.attemptCount // Current attempt number (1, 2, 3, ...)
      const runId = workflowStep.runId // Workflow run ID
      const stepId = workflowStep.stepId // Current step ID

      logger.info(`Payment attempt ${attempt} for run ${runId} (${stepId})`)

      // Different behavior based on attempt count
      if (attempt === 1) {
        // First attempt - might fail
      } else {
        // Retry attempt - use different strategy
      }
    }

    // Process payment...
    return { success: data.amount > 0 }
  },
})
// @snippet end wa-wf-workflow-step-wire

// @snippet start wa-wf-cancellation
export const cancellableOrderWorkflow = pikkuWorkflowFunc<
  { orderId: string; amount: number },
  { success: boolean }
>(async (_services, data, { workflow }) => {
  // Cancel if amount is invalid
  if (data.amount <= 0) {
    throw new WorkflowCancelledException(
      workflow.runId,
      `Invalid order amount: ${data.amount}`
    )
  }

  // Cancel if order is already cancelled in database
  const order = await workflow.do('Fetch order', 'getOrder', { orderId: data.orderId })
  if (order.status === 'cancelled') {
    throw new WorkflowCancelledException(
      workflow.runId,
      `Order ${data.orderId} was already cancelled`
    )
  }

  // Continue with order processing...
  return { success: true }
})
// @snippet end wa-wf-cancellation

// @snippet start wa-wf-step-order
export const stepOrderExamples = {
  // WRONG: adding a step before steps that already completed
  wrong: pikkuWorkflowFunc(async (_services, data: { orderId: string }, { workflow }) => {
    await workflow.do('New step', 'getOrder', data) // DON'T INSERT HERE if a run is in flight
    await workflow.do('Existing step 1', 'getOrder', data)
    await workflow.do('Existing step 2', 'getOrder', data)
  }),

  // CORRECT: add new steps at the end
  correct: pikkuWorkflowFunc(async (_services, data: { orderId: string }, { workflow }) => {
    await workflow.do('Existing step 1', 'getOrder', data)
    await workflow.do('Existing step 2', 'getOrder', data)
    await workflow.do('New step', 'getOrder', data) // Safe to add here
  }),
}
// @snippet end wa-wf-step-order

// ---- configuration: workflow service API

// @snippet start wa-wf-get-run
export const checkWorkflowStatus = pikkuSessionlessFunc({
  input: z.object({ runId: z.string() }),
  func: async ({ workflowService }, data) => {
    const run = await workflowService.getRun(data.runId)

    if (!run) {
      throw new Error(`Workflow not found: ${data.runId}`)
    }

    return {
      status: run.status, // 'running' | 'completed' | 'failed' | 'cancelled' | 'suspended'
      output: run.output, // Output data if completed
      error: run.error, // Error details if failed
      createdAt: run.createdAt, // Creation timestamp
    }
  },
})
// @snippet end wa-wf-get-run

// @snippet start wa-wf-get-run-history
export const getWorkflowHistory = pikkuSessionlessFunc({
  input: z.object({ runId: z.string() }),
  func: async ({ workflowService }, data) => {
    const history = await workflowService.getRunHistory(data.runId)

    // Each entry includes:
    // - stepName: Step description
    // - status: 'succeeded' | 'failed'
    // - attemptCount: Attempt number (1, 2, 3, ...)
    // - result: Step result (if succeeded)
    // - error: Error details (if failed)
    // - createdAt: Timestamp

    return history
  },
})
// @snippet end wa-wf-get-run-history

// @snippet start wa-wf-poll
export const triggerAndWait = pikkuSessionlessFunc({
  func: async ({ workflowService }, _data, { rpc }) => {
    // Start workflow
    const { runId } = await rpc.startWorkflow('checkoutWorkflow', {
      basketId: 'basket-123',
      userId: 'user-456',
      shippingAddress: { line1: '1 High St', city: 'London', postcode: 'SW1A 1AA', country: 'GB' },
    })

    // Poll for completion
    const maxAttempts = 30
    const pollIntervalMs = 1000

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const run = await workflowService.getRun(runId)

      if (!run) {
        throw new Error(`Workflow not found: ${runId}`)
      }

      if (run.status === 'completed') {
        return run.output
      }

      if (run.status === 'failed') {
        throw new Error(run.error?.message || 'Workflow failed')
      }

      if (run.status === 'cancelled') {
        throw new Error('Workflow was cancelled')
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error(`Workflow timeout after ${maxAttempts} attempts`)
  },
})
// @snippet end wa-wf-poll

// ---- graph workflows

// @snippet start wa-graph-basic
export const checkoutGraph = pikkuWorkflowGraph({
  description: 'Validate a basket, create the order, charge the card, finalize',
  tags: ['checkout', 'orders'],
  nodes: {
    validate: 'validateBasket', // node ID -> RPC function name
    createOrder: 'createOrderRecord',
    charge: 'chargeCard',
    finalize: 'finalizeOrder',
  },
  config: {
    validate: {
      next: 'createOrder', // which node runs next
      input: (ref) => ({
        basketId: ref('trigger', 'basketId'), // from the workflow input
      }),
    },
    createOrder: {
      next: 'charge',
      input: (ref) => ({
        userId: ref('trigger', 'userId'),
        shippingAddress: ref('trigger', 'shippingAddress'),
        totalCents: ref('validate', 'totalCents'), // from the validate node's output
        items: ref('validate', 'items'),
      }),
    },
    charge: {
      next: 'finalize',
      input: (ref) => ({
        orderId: ref('createOrder', 'orderId'),
        totalCents: ref('validate', 'totalCents'),
      }),
    },
    finalize: {
      input: (ref) => ({
        orderId: ref('createOrder', 'orderId'),
        basketId: ref('trigger', 'basketId'),
        userId: ref('trigger', 'userId'),
      }),
    },
  },
})
// @snippet end wa-graph-basic

// @snippet start wa-graph-agent-node
export const triageWorkflow = pikkuWorkflowGraph({
  description: 'Ask the shop assistant about an order, then record the outcome',
  nodes: {
    classify: 'shopAssistant', // AI agent
    record: 'writeAuditEvent', // RPC function
  },
  config: {
    classify: {
      input: (ref) => ({
        message: ref('trigger', 'message'),
        threadId: ref('trigger', 'orderId'),
        resourceId: ref('trigger', 'userId'),
      }),
      next: 'record',
    },
    record: {
      input: (ref) => ({
        entityType: 'order',
        entityId: ref('trigger', 'orderId'),
        action: 'triaged',
      }),
    },
  },
})
// @snippet end wa-graph-agent-node

// @snippet start wa-graph-sequential
export const sequentialGraph = pikkuWorkflowGraph({
  nodes: {
    step1: 'validateBasket',
    step2: 'createOrderRecord',
    step3: 'chargeCard',
  },
  config: {
    step1: { next: 'step2' },
    step2: { next: 'step3' },
    step3: {}, // no next = workflow ends
  },
})
// @snippet end wa-graph-sequential

// @snippet start wa-graph-parallel
export const parallelGraph = pikkuWorkflowGraph({
  nodes: {
    fetchData: 'getOrder',
    sendEmail: 'sendOrderConfirmation',
    logActivity: 'writeAuditEvent',
    updateStock: 'updateItem',
  },
  config: {
    fetchData: {
      next: ['sendEmail', 'logActivity', 'updateStock'], // all three run in parallel
    },
  },
})
// @snippet end wa-graph-parallel

// @snippet start wa-graph-branch-fn
export const checkInventory = pikkuSessionlessFunc({
  input: z.object({ productId: z.string() }),
  output: z.object({ available: z.boolean() }),
  func: async ({ kysely }, { productId }, { graph }) => {
    const item = await kysely
      .selectFrom('item')
      .select(['stock'])
      .where('itemId', '=', productId)
      .executeTakeFirst()

    if (!item) {
      graph?.branch('discontinued')
    } else if (item.stock > 0) {
      graph?.branch('inStock')
    } else {
      graph?.branch('outOfStock')
    }

    return { available: (item?.stock ?? 0) > 0 }
  },
})
// @snippet end wa-graph-branch-fn

// @snippet start wa-graph-on-error
export const errorHandlingGraph = pikkuWorkflowGraph({
  nodes: {
    processPayment: 'chargeCard',
    sendConfirmation: 'sendOrderConfirmation',
    handlePaymentError: 'refundOrder',
  },
  config: {
    processPayment: {
      next: 'sendConfirmation',
      onError: 'handlePaymentError', // runs if processPayment fails
    },
    handlePaymentError: {
      input: (ref) => ({
        orderId: ref('trigger', 'orderId'),
      }),
    },
  },
})
// @snippet end wa-graph-on-error

// @snippet start wa-graph-state
export const updateProgress = pikkuSessionlessFunc({
  input: z.object({ step: z.string() }),
  output: z.object({ updated: z.boolean() }),
  func: async (_services, { step }, { graph }) => {
    const state = await graph!.getState()
    const completedSteps = (state.completedSteps as string[]) || []

    await graph!.setState('completedSteps', [...completedSteps, step])
    await graph!.setState('lastUpdated', new Date().toISOString())

    return { updated: true }
  },
})
// @snippet end wa-graph-state

// ---- credentials

// @snippet start wa-cred-define
defineCredential({
  name: 'stripe',
  displayName: 'Stripe API Key',
  description: 'API key for Stripe payment processing',
  type: 'wire',
  schema: z.object({ apiKey: z.string() }),
})
// @snippet end wa-cred-define

// @snippet start wa-cred-oauth2
defineCredential({
  name: 'google-sheets',
  displayName: 'Google Sheets',
  type: 'wire',
  schema: z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
  }),
  oauth2: {
    appCredentialSecretId: 'GOOGLE_OAUTH_APP',
    tokenSecretId: 'GOOGLE_OAUTH_TOKENS',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  },
})
// @snippet end wa-cred-oauth2

// @snippet start wa-cred-singleton
defineCredential({
  name: 'slack',
  displayName: 'Slack',
  type: 'singleton',
  schema: z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
  }),
  oauth2: {
    appCredentialSecretId: 'SLACK_OAUTH_APP',
    tokenSecretId: 'SLACK_OAUTH_TOKENS',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['chat:write', 'channels:read'],
  },
})
// @snippet end wa-cred-singleton

// @snippet start wa-cred-api-key
defineCredential({
  name: 'hmac-key',
  displayName: 'HMAC Signing Key',
  type: 'wire',
  schema: z.object({ secretKey: z.string() }),
})
// @snippet end wa-cred-api-key

// @snippet start wa-cred-agent
// The agent just lists its tools — credential checks happen at runtime
export const assistant = pikkuAgent({
  name: 'assistant',
  description: 'A helpful assistant with integrations',
  goal: 'Help the user with their integrations.',
  model: 'openai/gpt-4o-mini',
  tools: [listOrders, getOrder],
  // If a tool requires a credential (say 'google-sheets') and the user
  // hasn't connected it, the agent pauses and asks the client to collect it.
})
// @snippet end wa-cred-agent
