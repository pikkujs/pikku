import { z } from 'zod'
import { pikkuFunc, pikkuSessionlessFunc, pikkuVoidFunc } from '#pikku/function'
import { addHTTPMiddleware, addGlobalMiddleware, cors, pikkuMiddleware } from '#pikku/middleware'
import { wireHTTP } from '#pikku/http'
import { wireChannel } from '#pikku/channel'
import { wireQueueWorker } from '#pikku/queue'
import { wireScheduler } from '#pikku/scheduler'
import { wireCLI, pikkuCLICommand } from '#pikku/cli'
import { defineSecret } from '#pikku/secrets'
import { telemetryOuter, telemetryInner } from '@pikku/core/middleware'
import { betterAuthSession, betterAuthStatelessSession } from '@pikku/better-auth'
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  addGlobalPermission,
  pikkuAuth,
  pikkuPermission,
  pikkuPermissionFactory,
} from '#pikku/auth'
import {
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
  pikkuChannelFunc,
} from '#pikku/channel'
import { wireTrigger } from '#pikku/trigger'
import { pikkuScenarioStep } from '#pikku/scenarios'
import { defineFeatureFlags } from '#pikku/scopes'
import { assertFeatureAvailable, resolveFlag } from '@pikku/core/flag'
import { pikkuServerLifecycle } from '@pikku/core/utils'
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '@pikku/core/errors'
import type { TypedSecretService } from '../../../.pikku/secrets/pikku-secrets.gen.js'
import type { FeatureFlagSource } from '@pikku/core/services'
import type { SingletonServices, UserSession } from '../../application-types.d.js'

// @snippet start co-func-basic
export const getBook = pikkuFunc({
  input: z.object({ bookId: z.string() }),
  func: async ({ kysely }, { bookId }) => {
    const book = await kysely
      .selectFrom('item')
      .selectAll()
      .where('itemId', '=', bookId)
      .executeTakeFirst()
    if (!book) throw new NotFoundError()
    return book
  },
  title: 'Fetch a book by ID',
  description: 'Returns a book from the database',
  tags: ['books'],
})
// @snippet end co-func-basic

// @snippet start co-func-services
export const logBookLookup = pikkuFunc({
  input: z.object({ bookId: z.string() }),
  func: async ({ kysely, logger }, { bookId }) => {
    // Only kysely and logger are included in this function's bundle
    logger.info({ event: 'book_lookup', bookId })
    return kysely.selectFrom('item').selectAll().where('itemId', '=', bookId).execute()
  },
})
// @snippet end co-func-services

// @snippet start co-func-wire-http
export const userAgentOf = pikkuFunc({
  func: async (_services, _data, { http }) => {
    // http is only present when the call arrived over HTTP
    return { userAgent: http?.request?.header('user-agent') ?? null }
  },
})
// @snippet end co-func-wire-http

// @snippet start co-func-typed-input
type CreateBookInput = {
  title: string
  author: string
  publishedYear?: number
}

export const createBook = pikkuFunc<CreateBookInput, { id: string }>({
  func: async ({ logger }, data) => {
    // data is guaranteed to match CreateBookInput:
    // title and author are strings, publishedYear is an optional number
    logger.info({ event: 'book_created', title: data.title })
    return { id: crypto.randomUUID() }
  },
  title: 'Create a new book',
  tags: ['books'],
})
// @snippet end co-func-typed-input

// @snippet start co-func-session-read
export const whoAmI = pikkuFunc({
  func: async (_services, _data, { session }) => {
    // session IS the user session value directly
    return { userId: session?.userId }
  },
})
// @snippet end co-func-session-read

// @snippet start co-func-auth-flow
export const login = pikkuSessionlessFunc<
  { email: string; password: string },
  { userId: string }
>({
  func: async ({ kysely }, data, { setSession }) => {
    const user = await kysely
      .selectFrom('user')
      .select(['id', 'email'])
      .where('email', '=', data.email)
      .executeTakeFirst()
    if (!user) throw new UnauthorizedError('Invalid credentials')
    await setSession?.({ userId: user.id, role: 'customer' })
    return { userId: user.id }
  },
  auth: false,
  title: 'Log in',
})

export const logout = pikkuFunc<void, void>({
  func: async (_services, _data, { clearSession }) => {
    await clearSession?.()
  },
  title: 'Log out',
})

export const getMe = pikkuFunc({
  func: async ({ kysely }, _data, { session }) => {
    return kysely
      .selectFrom('user')
      .select(['id', 'email', 'name'])
      .where('id', '=', session.userId)
      .executeTakeFirstOrThrow()
  },
  title: 'Get the current user',
})
// @snippet end co-func-auth-flow

// @snippet start co-permission-basic
export const requireAuth = pikkuPermission(async (_services, _data, { session }) => {
  return session?.userId != null
})

export const requireOwnership = pikkuPermission<{ orderId: string }>(
  async ({ kysely }, { orderId }, { session }) => {
    if (!session?.userId) return false
    const order = await kysely
      .selectFrom('order')
      .select('userId')
      .where('orderId', '=', orderId)
      .executeTakeFirst()
    return order?.userId === session.userId
  }
)
// @snippet end co-permission-basic

// @snippet start co-permission-on-func
export const cancelMyOrder = pikkuFunc<{ orderId: string }, void>({
  func: async ({ kysely }, { orderId }) => {
    await kysely
      .updateTable('order')
      .set({ status: 'cancelled' })
      .where('orderId', '=', orderId)
      .execute()
  },
  permissions: {
    auth: requireAuth,
    owner: requireOwnership,
  },
  title: 'Cancel an order',
  tags: ['orders'],
})
// @snippet end co-permission-on-func

// @snippet start co-permission-quota
export const withinQuota = pikkuPermission(async ({ kysely }, _data, { session }) => {
  if (!session?.userId) return false

  const open = await kysely
    .selectFrom('order')
    .select(kysely.fn.countAll<number>().as('n'))
    .where('userId', '=', session.userId)
    .where('status', '=', 'pending')
    .executeTakeFirstOrThrow()

  return open.n < 5 // At most five open orders
})

export const activeBasket = pikkuPermission(async ({ kysely }, _data, { session }) => {
  if (!session?.userId) return false

  const basket = await kysely
    .selectFrom('basket')
    .select('updatedAt')
    .where('userId', '=', session.userId)
    .executeTakeFirst()

  return basket != null && new Date(basket.updatedAt) > new Date(Date.now() - 86_400_000)
})
// @snippet end co-permission-quota

// @snippet start co-permission-global
export const registerGlobalPermissions = () => {
  // Every function now also requires a valid session
  addGlobalPermission([requireAuth])
}
// @snippet end co-permission-global

// @snippet start co-permission-throw-vs-false
// Good: return false for "not allowed"; let real failures (a database error) throw
export const ownsBasket = pikkuPermission<{ basketId: string }>(
  async ({ kysely }, { basketId }, { session }) => {
    if (!session?.userId) return false
    const basket = await kysely
      .selectFrom('basket')
      .select('userId')
      .where('basketId', '=', basketId)
      .executeTakeFirst()
    return basket?.userId === session.userId
  }
)

// Bad: throwing for "not allowed" surfaces as a 500, not a 403
export const ownsBasketBad = pikkuPermission<{ basketId: string }>(
  async (_services, _data, { session }) => {
    if (!session?.userId) {
      throw new Error('Not authenticated')
    }
    return true
  }
)
// @snippet end co-permission-throw-vs-false

// @snippet start co-auth-flags
// Requires a session (the default)
export const getProfileData = pikkuFunc({
  func: async ({ kysely }, _data, { session }) => {
    return kysely
      .selectFrom('user')
      .selectAll()
      .where('id', '=', session.userId)
      .executeTakeFirst()
  },
  auth: true,
  title: 'Get user profile',
  tags: ['users'],
})

// No session required
export const getPublicItems = pikkuFunc({
  func: async ({ kysely }) => {
    return kysely.selectFrom('item').selectAll().where('isActive', '=', 1).execute()
  },
  auth: false,
  title: 'Get public items',
  tags: ['items'],
})
// @snippet end co-auth-flags

// @snippet start co-auth-with-permissions
export const deleteMyAccount = pikkuFunc({
  func: async ({ kysely }, _data, { session }) => {
    await kysely.deleteFrom('user').where('id', '=', session.userId).execute()
  },
  auth: true, // A session is required
  permissions: {
    verified: requireAuth, // Additional check
  },
  title: 'Delete account',
  tags: ['users'],
})
// @snippet end co-auth-with-permissions

// @snippet start co-permission-factory
export const requireRole = pikkuPermissionFactory<{ role: UserSession['role'] }>(
  ({ role }) => {
    return pikkuPermission(async (_services, _data, { session }) => {
      return session?.role === role
    })
  }
)

export const deleteUser = pikkuFunc<{ userId: string }, void>({
  func: async ({ kysely }, { userId }) => {
    await kysely.deleteFrom('user').where('id', '=', userId).execute()
  },
  permissions: {
    admin: requireRole({ role: 'admin' }),
  },
  title: 'Delete a user',
  tags: ['users'],
})
// @snippet end co-permission-factory

// @snippet start co-func-errors
export const updateBook = pikkuFunc<{ bookId: string; title: string }, { bookId: string }>({
  func: async ({ kysely }, data) => {
    if (!data.title || data.title.length < 1) {
      throw new BadRequestError('Title is required')
    }

    const result = await kysely
      .updateTable('item')
      .set({ name: data.title })
      .where('itemId', '=', data.bookId)
      .executeTakeFirst()
    if (!result.numUpdatedRows) {
      throw new NotFoundError('Book not found')
    }
    return { bookId: data.bookId }
  },
  title: 'Update a book',
  tags: ['books'],
})
// @snippet end co-func-errors

// @snippet start co-func-zod
export const createBookWithSchema = pikkuFunc({
  func: async (_services, data) => {
    return { id: crypto.randomUUID(), title: data.title, author: data.author }
  },
  input: z.object({
    title: z.string().min(1),
    author: z.string(),
    publishedYear: z.number().optional(),
  }),
  output: z.object({
    id: z.string(),
    title: z.string(),
    author: z.string(),
  }),
  title: 'Create a new book',
  tags: ['books'],
})
// @snippet end co-func-zod

// @snippet start co-func-expose
export const internalHelper = pikkuFunc<{ id: string }, { ok: boolean }>({
  func: async () => ({ ok: true }),
  // No flags: internal-only by default, not exposed via external RPC
})

export const publicAPI = pikkuFunc<{ id: string }, { ok: boolean }>({
  func: async () => ({ ok: true }),
  expose: true, // Explicitly exposed via RPC
})
// @snippet end co-func-expose

// @snippet start co-session-update
export const updatePreferences = pikkuFunc<{ theme: string }, void>({
  func: async (_services, _data, { session, setSession }) => {
    // Update the session - middleware will persist the change
    setSession?.({ ...session })
  },
  title: 'Update user preferences',
  tags: ['user'],
})
// @snippet end co-session-update

// @snippet start co-session-optional
export const getPublicData = pikkuSessionlessFunc({
  func: async ({ kysely }, _data, { session }) => {
    // session might be undefined
    if (session) {
      // User is logged in, return personalised data
      return kysely.selectFrom('order').selectAll().where('userId', '=', session.userId).execute()
    }
    // Return generic data for anonymous users
    return kysely.selectFrom('item').selectAll().where('isActive', '=', 1).execute()
  },
  auth: false,
  title: 'Get public data (personalised if logged in)',
  tags: ['public'],
})
// @snippet end co-session-optional

// @snippet start co-session-refresh-middleware
// Touch the session on every call so it stays alive
export const refreshSessionMiddleware = pikkuMiddleware(async (_services, { session, setSession }, next) => {
  if (session) {
    setSession?.({ ...session })
  }
  return await next()
})
// @snippet end co-session-refresh-middleware

// @snippet start co-session-wire-ops
export const sessionOps = pikkuFunc({
  func: async (_services, _data, { session, setSession, clearSession }) => {
    const userId = session.userId // read the session

    setSession?.({ userId, role: 'customer' }) // set a new one (e.g. after login)

    clearSession?.() // clear it (e.g. on logout)
  },
})
// @snippet end co-session-wire-ops

// @snippet start co-wire-http
export const httpDetails = pikkuFunc({
  func: async (_services, _data, { http }) => {
    // Request details
    const method = http?.request?.method()
    const path = http?.request?.path()
    const authHeader = http?.request?.header('authorization')
    const cookie = http?.request?.cookie('session')

    // Response control
    http?.response?.status(201)
    http?.response?.header('X-Custom', 'value')
    http?.response?.cookie('session', 'token', { httpOnly: true })
    return { method, path, authHeader, cookie }
  },
})
// @snippet end co-wire-http

// @snippet start co-wire-channel
export const channelDetails = pikkuChannelFunc<{ hello: string }, { message: string }>(
  async (_services, _data, { channel }) => {
    // Send data to the client
    channel.send({ message: 'hello' })

    // Close the connection
    channel.close()
  }
)
// @snippet end co-wire-channel

// @snippet start co-wire-trigger
export const onExternalEvent = pikkuSessionlessFunc<void, void>({
  func: async (_services, _input, { trigger }) => {
    // Fire the trigger when an event occurs
    trigger?.invoke({ payload: 'event data' })
  },
})

export const registerExternalTrigger = () => {
  wireTrigger({ name: 'external-event', func: onExternalEvent })
}
// @snippet end co-wire-trigger

// @snippet start co-wire-rpc-remote
export const callRemote = pikkuFunc<{ userId: string }, unknown>({
  func: async (_services, data, { rpc }) => {
    // Call another function internally
    const local = await rpc.invoke('getItem', { itemId: data.userId })

    // Call a function in another deployed unit
    const remote = await rpc.remote('externalService', data)
    return { local, remote }
  },
})
// @snippet end co-wire-rpc-remote

// @snippet start co-service-interface
interface Book {
  id: string
  title: string
}

interface BookService {
  getBook(id: string): Book | undefined
  createBook(book: Book): void
}

export class LocalBookService implements BookService {
  private books = new Map<string, Book>()

  getBook(id: string) {
    return this.books.get(id)
  }

  createBook(book: Book) {
    this.books.set(book.id, book)
  }
}
// @snippet end co-service-interface

// @snippet start co-service-use
export const getItemFromService = pikkuFunc<{ itemId: string }, unknown>({
  // Destructure only the services this function needs: only `kysely`
  // is included in the bundle for it
  func: async ({ kysely }, { itemId }) => {
    const item = await kysely
      .selectFrom('item')
      .selectAll()
      .where('itemId', '=', itemId)
      .executeTakeFirst()
    if (!item) {
      throw new NotFoundError('Item not found')
    }
    return item
  },
  title: 'Get an item by ID',
  tags: ['items'],
})
// @snippet end co-service-use

// @snippet start co-lifecycle-minimal
export const minimalLifecycle = pikkuServerLifecycle<SingletonServices>({
  afterStart: async ({ logger }) => {
    logger.info('Server ready')
  },
})
// @snippet end co-lifecycle-minimal

const migrateToLatest = async (_kysely: unknown) => {}
const seedItems = async () => {}

// @snippet start co-lifecycle
export const lifecycle = pikkuServerLifecycle<SingletonServices>({
  beforeStart: async ({ kysely, logger }) => {
    await migrateToLatest(kysely)
    logger.info('Database up to date')
  },

  afterStart: async ({ logger, variables }) => {
    if ((await variables.get('SCENARIO_ACTOR_SECRET')) === 'true') {
      await seedItems()
      logger.info('Seeded development data')
    }
  },

  beforeStop: async ({ logger }) => {
    logger.info('Shutting down')
  },
})
// @snippet end co-lifecycle

// @snippet start co-feature-flags-define
export const registerFeatureFlags = () => {
  defineFeatureFlags({
    sandboxes: {
      description: 'Per-user sandbox environments',
    },
    calendar: {
      description: 'The shared calendar',
      anyOf: ['catalogue:read', 'orders:read'],
    },
  })
}
// @snippet end co-feature-flags-define

// @snippet start co-feature-flag-assert
export const guardedWork = async (
  featureFlags: FeatureFlagSource,
  session: UserSession,
  organizationId: string
) => {
  await assertFeatureAvailable(
    'sandboxes',
    featureFlags, // the FeatureFlagSource service
    session,
    { organizationId } // optional subject
  )
}
// @snippet end co-feature-flag-assert

// @snippet start co-feature-flag-resolve
export const readFlag = async (
  featureFlags: FeatureFlagSource,
  session: UserSession,
  organizationId: string
) => {
  const snapshot = await featureFlags.snapshot()
  const { available, capable } = resolveFlag(
    'calendar',
    ['catalogue:read', 'orders:read'], // the flag's anyOf
    session,
    snapshot,
    { organizationId } // optional subject
  )
  return { available, capable }
}
// @snippet end co-feature-flag-resolve

// @snippet start co-scenario-step
export const buysTheItem = pikkuScenarioStep<{ name: string }, { name: string }>({
  name: 'buysTheItem',
  description: 'puts one item in the basket',
  template: 'buys the {name}',
  actor: true,
  default: async (_services, { name }, { actor }) => {
    const catalogue = await actor.invoke('listItems', { search: name })
    const basket = await actor.invoke('getBasket', {})
    await actor.invoke('addToBasket', {
      basketId: basket.basketId,
      itemId: catalogue.items[0].itemId,
      quantity: 1,
    })
    return { name }
  },
})
// @snippet end co-scenario-step

// @snippet start co-eventhub-broadcast-all
export const broadcastToRoom = pikkuFunc<{ roomId: string; text: string }, void>({
  func: async ({ eventHub }, { roomId, text }, { session }) => {
    // channelId null: send to everyone subscribed to the topic
    await eventHub?.publish(`room:${roomId}`, null, {
      type: 'message',
      text,
      userId: session.userId,
    })
  },
})
// @snippet end co-eventhub-broadcast-all

// @snippet start co-eventhub-exclude-sender
export const announceJoin = pikkuChannelFunc<{ roomId: string; username: string }, void>(
  async ({ eventHub }, { roomId, username }, { channel, session }) => {
    // Pass the sender's channelId to exclude them from the broadcast
    await eventHub?.publish(`room:${roomId}`, channel.channelId, {
      type: 'user_joined',
      userId: session?.userId,
      username,
    })
  }
)
// @snippet end co-eventhub-exclude-sender

// @snippet start co-eventhub-room
// Connection - subscribe to the room
export const joinRoom = pikkuChannelConnectionFunc<{ welcome: string }>(
  async ({ eventHub }, _data, { channel }) => {
    const room = (channel.openingData as { room: string }).room
    await eventHub?.subscribe(`room:${room}`, channel.channelId)
    return { welcome: `Welcome to ${room}!` }
  }
)

// Message - broadcast to the room (excluding the sender)
export const sendMessage = pikkuChannelFunc<{ message: string }, void>(
  async ({ eventHub }, data, { channel, session }) => {
    const room = (channel.openingData as { room: string }).room
    await eventHub?.publish(
      `room:${room}`,
      channel.channelId, // Don't echo back to sender
      {
        message: data.message,
        userId: session?.userId,
        timestamp: Date.now(),
      }
    )
  }
)

// Disconnect - cleanup (optional, happens automatically)
export const leaveRoom = pikkuChannelDisconnectionFunc(
  async ({ eventHub }, _data, { channel }) => {
    await eventHub?.unsubscribe(
      `room:${(channel.openingData as { room: string }).room}`,
      channel.channelId
    )
  }
)
// @snippet end co-eventhub-room

// @snippet start co-eventhub-presence
// Publish presence updates
export const updatePresence = pikkuFunc<{ status: 'online' | 'away' | 'offline' }, void>({
  func: async ({ eventHub }, data, { session }) => {
    await eventHub?.publish('presence:updates', null, {
      userId: session.userId,
      status: data.status,
      timestamp: Date.now(),
    })
  },
})

// Subscribe to presence on connect
export const watchPresence = pikkuChannelConnectionFunc(
  async ({ eventHub }, _data, { channel }) => {
    await eventHub?.subscribe('presence:updates', channel.channelId)
  }
)
// @snippet end co-eventhub-presence

// @snippet start co-eventhub-notifications
// Subscribe the user to their personal notification topic
export const connectNotifications = pikkuChannelConnectionFunc<void>(
  async ({ eventHub }, _data, { channel }) => {
    const userId = (channel.openingData as { userId: string }).userId
    await eventHub?.subscribe(`notifications:${userId}`, channel.channelId)
  }
)

// Trigger a notification from any function
export const sendNotification = pikkuFunc<
  { userId: string; title: string; message: string },
  void
>({
  func: async ({ eventHub }, data) => {
    await eventHub?.publish(`notifications:${data.userId}`, null, {
      title: data.title,
      message: data.message,
      timestamp: Date.now(),
    })
  },
})
// @snippet end co-eventhub-notifications

// @snippet start co-exception-usage
export const createAccount = pikkuSessionlessFunc<
  { email: string },
  { userId: string }
>({
  func: async ({ kysely }, data) => {
    if (!data.email.includes('@')) {
      throw new BadRequestError('Invalid email format')
    }

    const existing = await kysely
      .selectFrom('user')
      .select('id')
      .where('email', '=', data.email)
      .executeTakeFirst()
    if (existing) {
      throw new ConflictError('User with this email already exists')
    }

    return { userId: crypto.randomUUID() }
  },
})

export const getOwnBasket = pikkuFunc<{ basketId: string }, { basketId: string }>({
  func: async ({ kysely }, { basketId }, { session }) => {
    const basket = await kysely
      .selectFrom('basket')
      .selectAll()
      .where('basketId', '=', basketId)
      .executeTakeFirst()
    if (!basket) {
      throw new NotFoundError(`Basket ${basketId} not found`)
    }

    if (basket.userId !== session.userId && session.role !== 'admin') {
      throw new ForbiddenError('Access denied')
    }

    return { basketId }
  },
})
// @snippet end co-exception-usage

// @snippet start co-exception-messages
export const errorMessages = (userId: string) => {
  // Default message
  const plain = new BadRequestError()

  // Custom message
  const custom = new BadRequestError('Username must be at least 3 characters long')

  // Dynamic message
  const dynamic = new NotFoundError(`User with ID ${userId} not found`)
  return [plain, custom, dynamic]
}
// @snippet end co-exception-messages

// @snippet start co-logger-usage
export const logExamples = pikkuFunc({
  func: async ({ logger }) => {
    logger.info('User signed in')
    logger.info({ userId: 'user-123', action: 'sign-in' })
    logger.error(new Error('Connection failed'))
  },
})
// @snippet end co-logger-usage

// @snippet start co-audit-function
export const deleteAccount = pikkuFunc<{ accountId: string }, void>({
  audit: true, // or { durability: 'transactional' }
  func: async ({ kysely, auditLog }, { accountId }) => {
    await kysely.deleteFrom('user').where('id', '=', accountId).execute()

    await auditLog.write({
      type: 'account.deleted',
      source: 'explicit',
      metadata: { accountId },
    })
  },
})
// @snippet end co-audit-function

// @snippet start co-email-send
export const sendWelcomeEmail = pikkuFunc<{ email: string; name: string }, void>({
  func: async ({ emailService }, data) => {
    await emailService.send({
      to: data.email,
      subject: 'Welcome!',
      text: `Hello ${data.name}!`,
    })
  },
})
// @snippet end co-email-send

// @snippet start co-jwt-encode-decode
interface UserTokenPayload {
  userId: string
  email: string
  role: string
}

// Issue a token on login
export const issueToken = pikkuSessionlessFunc<
  { email: string },
  { token: string }
>({
  func: async ({ kysely, jwt }, { email }) => {
    const user = await kysely
      .selectFrom('user')
      .select(['id', 'email'])
      .where('email', '=', email)
      .executeTakeFirst()
    if (!user) throw new UnauthorizedError('Invalid credentials')

    const token = await jwt!.encode<UserTokenPayload>(
      { value: 24, unit: 'hour' },
      { userId: user.id, email: user.email, role: 'customer' }
    )

    return { token }
  },
})

// Validate a token (typically done in middleware, not in functions directly)
export const readToken = async (jwt: NonNullable<SingletonServices['jwt']>, token: string) => {
  return await jwt.decode<UserTokenPayload>(
    token,
    new UnauthorizedError('Invalid or expired token')
  )
}
// @snippet end co-jwt-encode-decode

// @snippet start co-scheduler-rpc
export const requestPasswordReset = pikkuFunc<{ email: string }, void>({
  func: async ({ schedulerService }, { email }) => {
    // Expire the token in 30 minutes
    await schedulerService?.scheduleRPC('30m', 'expireResetToken', { email })
  },
})
// @snippet end co-scheduler-rpc

// @snippet start co-user-session-service
// Read and update the session
export const touchSession = pikkuFunc<void, { ok: boolean }>({
  func: async (_services, _data, { session, setSession }) => {
    if (!session) return { ok: false }

    await setSession?.({ ...session })

    return { ok: true }
  },
})

// Log out
export const endSession = pikkuFunc<void, { success: boolean }>({
  func: async (_services, _data, { clearSession }) => {
    await clearSession?.()
    return { success: true }
  },
})
// @snippet end co-user-session-service

// @snippet start co-variables-typed
export const readThreshold = pikkuSessionlessFunc<void, { threshold: number }>({
  func: async ({ variables }) => {
    // The value is typed by the schema in the defineVariable call
    const threshold = await variables.get('LOW_STOCK_THRESHOLD')
    return { threshold: threshold ?? 5 }
  },
})
// @snippet end co-variables-typed

// @snippet start co-variables-service
export const readVariables = pikkuSessionlessFunc<void, { threshold: number; debug: boolean }>({
  func: async ({ variables }) => {
    const threshold = await variables.get('LOW_STOCK_THRESHOLD')
    const all = await variables.getAll()

    return {
      threshold: threshold ?? 0,
      debug: all.SCENARIO_ACTOR_SECRET === 'true',
    }
  },
})
// @snippet end co-variables-service

// @snippet start co-versioning-invoke
export const invokeVersions = pikkuFunc({
  func: async (_services, _data, { rpc }) => {
    // Calls the latest version
    const latest = await rpc.invoke('getItem', { itemId: 'mug' })

    // Calls a specific version
    const first = await rpc.invoke('getItem@v1', { itemId: 'mug' })
    return { latest, first }
  },
})
// @snippet end co-versioning-invoke

// @snippet start co-node-metadata
export const sendEmailAction = pikkuSessionlessFunc<
  { to: string; subject: string; body: string },
  { messageId: string }
>({
  func: async ({ emailService }, data) => {
    const result = await emailService.send({
      to: data.to,
      subject: data.subject,
      text: data.body,
    })
    return { messageId: result.messageId ?? '' }
  },
  title: 'Send email',
  description: 'Sends an email via the configured email service',
  tags: ['email', 'notifications'],
  node: {
    displayName: 'Send Email',
    category: 'notifications',
    type: 'action',
  },
})
// @snippet end co-node-metadata

// @snippet start co-create-api-key
export const createAPIKey = pikkuFunc<{ userId: string }, { apiKey: string }>({
  func: async ({ jwt }, { userId }) => {
    const apiKey = await jwt!.encode({ value: 365, unit: 'day' }, { userId })
    return { apiKey }
  },
})
// @snippet end co-create-api-key

// @snippet start co-cookie-login
export const cookieLogin = pikkuSessionlessFunc<
  { username: string; password: string },
  { success: boolean }
>({
  func: async ({ kysely }, { username }, { setSession }) => {
    const user = await kysely
      .selectFrom('user')
      .select('id')
      .where('email', '=', username)
      .executeTakeFirst()
    if (!user) throw new UnauthorizedError()

    // This triggers the cookie middleware to set the cookie in the response
    await setSession?.({ userId: user.id, role: 'customer' })
    return { success: true }
  },
  auth: false,
})
// @snippet end co-cookie-login

// @snippet start co-credential-read
export const readCredential = pikkuFunc<void, { connected: boolean }>({
  func: async (_services, _data, wire) => {
    const cred = await wire.getCredential?.<{ accessToken: string }>('shipping-provider')
    if (!cred?.accessToken) {
      throw new UnauthorizedError('Connect the shipping provider first')
    }

    const response = await fetch('https://carrier.example.com/me', {
      headers: { Authorization: `Bearer ${cred.accessToken}` },
    })
    return { connected: response.ok }
  },
})
// @snippet end co-credential-read

// @snippet start co-credential-service
export const connectCarrier = pikkuFunc<{ apiKey: string }, void>({
  func: async ({ credentialService }, data, { session }) => {
    await credentialService?.set('carrier', data.apiKey, session.userId)
  },
})

export const chargeShipping = pikkuFunc<{ amount: number }, void>({
  func: async ({ credentialService }, _data, { session }) => {
    const apiKey = await credentialService?.get<string>('carrier', session.userId)
    if (!apiKey) {
      throw new BadRequestError('The carrier is not connected')
    }
    // ...
  },
})
// @snippet end co-credential-service

// @snippet start co-oauth-app-secret
export const registerCarrierOAuthSecret = () => {
  defineSecret({
    name: 'carrierOAuthApp',
    displayName: 'Carrier OAuth App',
    description: 'OAuth application credentials for the carrier',
    secretId: 'CARRIER_OAUTH_APP',
    schema: z.object({
      clientId: z.string(),
      clientSecret: z.string().optional(), // Optional for PKCE flows
    }),
  })
}
// @snippet end co-oauth-app-secret

// @snippet start co-cors-global
export const registerCors = () => {
  addHTTPMiddleware('*', [
    cors({
      origin: 'https://app.example.com',
      credentials: true,
    }),
  ])
}
// @snippet end co-cors-global

// @snippet start co-http-timeout
export const generateReport = pikkuFunc<void, { ready: boolean }>({
  func: async () => ({ ready: true }),
})

export const registerReportRoute = () => {
  wireHTTP({
    method: 'post',
    route: '/reports',
    func: generateReport,
    timeout: 30,
  })
}
// @snippet end co-http-timeout

// @snippet start co-telemetry
export const registerTelemetry = () => {
  addGlobalMiddleware([telemetryOuter(), telemetryInner()])
}
// @snippet end co-telemetry

// @snippet start co-better-auth-session
export const registerBetterAuthSession = () => {
  addHTTPMiddleware('*', [
    betterAuthSession({
      // Optional: enrich the Pikku session beyond { userId }
      mapSession: async ({ user }) => ({
        userId: user.id,
        role: 'customer' as const,
      }),
    }),
  ])
}
// @snippet end co-better-auth-session

// @snippet start co-better-auth-stateless
export const registerBetterAuthStateless = () => {
  addHTTPMiddleware('*', [betterAuthStatelessSession()])
}
// @snippet end co-better-auth-stateless

// @snippet start co-arch-func
// This function can be called via HTTP, WebSocket, RPC, or directly
export const getUserProfile = pikkuFunc<
  { userId: string },
  { name: string; email: string }
>({
  func: async ({ kysely }, { userId }) => {
    const user = await kysely
      .selectFrom('user')
      .select(['name', 'email'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow()
    return { name: user.name ?? '', email: user.email }
  },
  title: 'Get user profile',
  tags: ['users'],
})
// @snippet end co-arch-func

// @snippet start co-arch-wire
export const wireUserProfile = () => {
  // Wire to HTTP
  wireHTTP({
    method: 'get',
    route: '/users/:userId',
    func: getUserProfile,
  })

  // Wire to a WebSocket channel
  wireChannel({
    name: 'user-updates',
    route: '/user-updates',
    onMessageWiring: {
      action: {
        getUserProfile: { func: getUserProfile },
      },
    },
  })

  // Expose via RPC: set expose: true on the function (there is no wire* call).
  // External callers reach it at POST /rpc/:rpcName
}
// @snippet end co-arch-wire

// @snippet start co-arch-registration
// Example 1: exposed function, registered and callable via RPC
export const createUser = pikkuFunc<{ name: string }, { id: string }>({
  expose: true,
  func: async () => ({ id: crypto.randomUUID() }),
})
// Included: expose: true registers it

// Example 2: wired function, registered by its wiring
export const getUserById = pikkuFunc<{ id: string }, { id: string }>({
  func: async (_services, { id }) => ({ id }),
})

export const registerUserRoute = () => {
  wireHTTP({
    method: 'get',
    route: '/users/:id',
    func: getUserById,
  })
  // Included: the HTTP wiring registers it
}

// Example 3: internal helper, not registered
export const validateUserData = pikkuFunc<{ name: string }, { valid: boolean }>({
  func: async (_services, { name }) => ({ valid: name.length > 0 }),
})
// Not registered: not wired, exposed, or invoked
// @snippet end co-arch-registration

// @snippet start co-arch-tags
export const registerTaggedWirings = () => {
  // Tags can come from the wiring...
  wireHTTP({
    method: 'get',
    route: '/admin/users',
    func: getUserProfile,
    tags: ['admin', 'users'],
  })

  wireChannel({
    name: 'admin-events',
    route: '/admin-events',
    onMessageWiring: { action: { getUserProfile: { func: getUserProfile } } },
    tags: ['admin', 'events'],
  })
}
// @snippet end co-arch-tags

// @snippet start co-philosophy-email
export const sendWelcome = pikkuSessionlessFunc<
  { userEmail: string; userName: string },
  { sent: boolean }
>({
  func: async ({ emailService }, data) => {
    await emailService.send({
      to: data.userEmail,
      subject: 'Welcome!',
      text: `Hello ${data.userName}!`,
    })
    return { sent: true }
  },
})

export const sendDailyDigest = pikkuVoidFunc({
  func: async ({ logger }) => {
    logger.info('Digest sent')
  },
})

// @snippet end co-philosophy-email

// @snippet start co-philosophy-wire
export const wireWelcome = () => {
  // Process from a background queue
  wireQueueWorker({ name: 'emails', func: sendWelcome })

  // Or trigger on a schedule
  wireScheduler({ name: 'dailyDigest', schedule: '0 9 * * *', func: sendDailyDigest })
}
// @snippet end co-philosophy-wire

// @snippet start co-types-func
type SortInput = { sortBy: 'age' | 'name' }
type SortOutput = { users: Array<{ name: string; age: number }> }

export const sortedUsers = pikkuFunc<SortInput, SortOutput>({
  func: async (_services, { sortBy }) => {
    const users = [{ name: 'Ada', age: 36 }]
    return { users: users.sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : -1)) }
  },
})
// @snippet end co-types-func

// @snippet start co-comparison-pikku
export const createCustomer = pikkuSessionlessFunc<{ email: string }, { id: string }>({
  func: async ({ kysely }, { email }) => {
    const row = await kysely
      .insertInto('user')
      .values({ id: crypto.randomUUID(), email, emailVerified: 0 } as never)
      .returning('id')
      .executeTakeFirstOrThrow()
    return { id: row.id }
  },
})

export const wireEverywhere = () => {
  // Then wire it to any transport
  wireHTTP({ auth: false, method: 'post', route: '/customers', func: createCustomer })
  wireQueueWorker({ name: 'customer-creation', func: createCustomer })
  wireCLI({
    program: 'customers',
    commands: { create: pikkuCLICommand({ func: createCustomer }) },
  })
}
// @snippet end co-comparison-pikku

// @snippet start co-treeshake-wiring
export const getUserRecord = pikkuFunc<{ id: string }, unknown>({
  func: async ({ kysely }) => kysely.selectFrom('user').selectAll().execute(),
})

export const deleteUserRecord = pikkuFunc<{ id: string }, void>({
  func: async ({ kysely, auditLog }) => {
    await auditLog.write({ type: 'user.deleted', source: 'explicit' })
    await kysely.deleteFrom('user').execute()
  },
})

export const getStatus = pikkuFunc({
  func: async ({ logger }) => {
    logger.info('status')
    return { ok: true }
  },
})

export const wireTreeShake = () => {
  wireHTTP({ method: 'get', route: '/users/:id', func: getUserRecord })
  wireHTTP({ method: 'delete', route: '/admin/users/:id', func: deleteUserRecord })
  wireHTTP({ method: 'get', route: '/status', func: getStatus })
}
// @snippet end co-treeshake-wiring

// @snippet start co-treeshake-tags
export const generateTaggedReport = pikkuFunc({
  func: async ({ kysely }) => kysely.selectFrom('order').selectAll().execute(),
  tags: ['reports', 'background'],
})
// @snippet end co-treeshake-tags

// @snippet start co-test-direct-call
test('should return book by ID', async () => {
  // Mock your services
  const mockServices = {
    kysely: {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({
            executeTakeFirst: async () => ({ itemId: '123', name: 'Test Book' }),
          }),
        }),
      }),
    },
  }

  // Call the function directly
  const result = await getBook.func(
    mockServices as any,
    { bookId: '123' },
    {} as any // wire (holds session and transport info)
  )

  assert.equal((result as { name: string }).name, 'Test Book')
})
// @snippet end co-test-direct-call

// @snippet start co-test-session
test('should use the session userId', async () => {
  const mockServices = {
    kysely: {
      selectFrom: () => ({
        selectAll: () => ({
          where: (_column: string, _op: string, value: string) => {
            assert.equal(value, 'user-123')
            return { executeTakeFirst: async () => ({ id: value }) }
          },
        }),
      }),
    },
  }

  const session = { userId: 'user-123', role: 'customer' }

  // The session is passed on the wire object (third parameter)
  await getProfileData.func(mockServices as any, undefined as never, { session } as any)
})
// @snippet end co-test-session

// @snippet start co-test-error
test('should throw NotFoundError', async () => {
  const mockServices = {
    kysely: {
      selectFrom: () => ({
        selectAll: () => ({
          where: () => ({ executeTakeFirst: async () => undefined }),
        }),
      }),
    },
  }

  await assert.rejects(
    getBook.func(mockServices as any, { bookId: 'invalid' }, {} as any),
    NotFoundError
  )
})
// @snippet end co-test-error

// @snippet start co-test-mock-helper
// test-utils.ts
export const createMockServices = (overrides: Record<string, unknown> = {}) => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  emailService: {
    send: async () => ({ messageId: 'mock-id' }),
  },
  ...overrides,
})

// In a test
test('should send a welcome email', async () => {
  const sent: unknown[] = []
  const services = createMockServices({
    emailService: {
      send: async (message: unknown) => {
        sent.push(message)
        return { messageId: 'mock-id' }
      },
    },
  })

  await sendWelcomeEmail.func(services as any, { email: 'a@b.c', name: 'Ada' }, {} as any)
  assert.equal(sent.length, 1)
})
// @snippet end co-test-mock-helper

// @snippet start co-secret-client
class PaymentsClient {
  constructor(readonly apiKey: string) {}
}

// Read the secret where the service is built, then hand the client to your functions
export const buildPaymentsClient = async (secrets: TypedSecretService) => {
  const stripeKey = await secrets.getSecret('STRIPE_SECRET_KEY')
  // reveal() unwraps the SecretValue at the point it is needed
  return new PaymentsClient(stripeKey.reveal())
}
// @snippet end co-secret-client
