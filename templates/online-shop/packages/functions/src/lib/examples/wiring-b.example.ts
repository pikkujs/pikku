import { z } from 'zod'
import { pikkuFunc, pikkuSessionlessFunc, pikkuVoidFunc } from '#pikku/function'
import { wireQueueWorker } from '#pikku/queue'
import { wireHTTP } from '#pikku/http'
import { wireScheduler } from '#pikku/scheduler'
import { wireGateway } from '#pikku/gateway'
import {
  wireChannel,
  pikkuChannelFunc,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
} from '#pikku/channel'
import { wireCLI, pikkuCLICommand, pikkuCLIRender } from '#pikku/cli'
import { pikkuMiddleware, addGlobalMiddleware } from '#pikku/middleware'
import { pikkuAgent } from '#pikku/agent'
import { InvalidMiddlewareWireError } from '@pikku/core/errors'
import { sendOrderConfirmation } from '../../functions/notifications/send-order-confirmation.function.js'
import { getBasket } from '../../functions/basket/get-basket.function.js'
import { getItem } from '../../functions/items/get-item.function.js'
import { listItems } from '../../functions/items/list-items.function.js'
import { listOrders } from '../../functions/orders/list-orders.function.js'
import { sweepLowStock } from '../../functions/sweep-low-stock.function.js'
import { onLowStock } from '../../functions/on-low-stock.function.js'
import { dailySalesReport } from '../../functions/reports/daily-sales-report.function.js'
import { voiceInput, voiceOutput } from '@pikku/core/agent'
import { LocalGatewayService } from '@pikku/core/services'
import type {
  GatewayAdapter,
  GatewayInboundMessage,
  GatewayOutboundMessage,
} from '@pikku/core/gateway'

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

// @snippet start wb-queue-worker-config
export function wireConfiguredWorker() {
  wireQueueWorker({
    name: 'send-order-confirmation',
    func: sendOrderConfirmation,
    config: {
      // Processing
      batchSize: 3, // Messages to process in batch/parallel
      prefetch: 10, // Messages to prefetch for efficiency
      pollInterval: 5000, // Polling interval for pull-based queues (ms)

      // Timeouts
      visibilityTimeout: 300, // Message visibility timeout (seconds)
      lockDuration: 30000, // Job lock duration (ms)
      drainDelay: 5, // Wait time when queue is empty (seconds)

      // Job management
      removeOnComplete: 100, // Keep N completed jobs
      removeOnFail: 50, // Keep N failed jobs
      maxStalledCount: 3, // Max job recovery attempts

      // Other
      name: 'confirmation-worker', // Worker name for monitoring
      autorun: true, // Auto-start processor
    },
    tags: ['notifications'],
  })
}
// @snippet end wb-queue-worker-config

// @snippet start wb-queue-error-handling
export const chargeOrder = pikkuSessionlessFunc({
  func: async ({ kysely, logger }, { orderId }: { orderId: string }) => {
    try {
      await kysely
        .updateTable('order')
        .set({ status: 'paid' })
        .where('orderId', '=', orderId)
        .execute()
      logger.info({ event: 'order_charged', orderId })
    } catch (error) {
      logger.error({ event: 'order_charge_failed', orderId })

      // Throw to trigger the retry
      throw error
    }
  },
})
// @snippet end wb-queue-error-handling

// @snippet start wb-queue-add-job
export const queueConfirmation = pikkuSessionlessFunc({
  func: async (
    { queueService },
    { orderId, userId }: { orderId: string; userId: string }
  ) => {
    // A plain job
    const jobId = await queueService?.add('send-order-confirmation', {
      orderId,
      userId,
    })

    // The same job with options
    await queueService?.add(
      'send-order-confirmation',
      { orderId, userId },
      {
        priority: 1, // Job priority (lower = higher priority)
        delay: 5000, // Wait 5 seconds before processing
        attempts: 5, // Retry up to 5 times
        removeOnComplete: 100, // Keep last 100 completed jobs
        jobId: `confirm-${orderId}`, // Custom job ID
      }
    )

    return { jobId }
  },
})
// @snippet end wb-queue-add-job

// @snippet start wb-queue-job-status
export const confirmationStatus = pikkuSessionlessFunc({
  func: async ({ queueService, logger }, { jobId }: { jobId: string }) => {
    const job = await queueService?.getJob('send-order-confirmation', jobId)
    if (!job) return { found: false }

    const status = await job.status()
    const metadata = await job.metadata?.()

    switch (status) {
      case 'waiting':
        logger.info('Job is waiting to be processed')
        break
      case 'active':
        logger.info('Job is currently being processed')
        break
      case 'completed':
        logger.info({ result: job.result })
        break
      case 'failed':
        logger.info({ error: metadata?.error })
        break
      case 'delayed':
        logger.info('Job is delayed')
        break
    }

    return { found: true, status, progress: metadata?.progress }
  },
})
// @snippet end wb-queue-job-status

// @snippet start wb-queue-wait-for-completion
export const confirmAndWait = pikkuSessionlessFunc({
  func: async (
    { queueService },
    { orderId, userId }: { orderId: string; userId: string }
  ) => {
    const jobId = await queueService?.add('send-order-confirmation', {
      orderId,
      userId,
    })
    const job = await queueService?.getJob('send-order-confirmation', jobId!)

    // Only when the provider supports results (BullMQ, pg-boss — not SQS)
    return await job?.waitForCompletion?.(60000) // wait up to a minute
  },
})
// @snippet end wb-queue-wait-for-completion

export const processExport = pikkuVoidFunc({
  func: async ({ logger }) => {
    logger.info({ event: 'export_started' })
  },
  title: 'Build a large export',
  tags: ['exports'],
})

// @snippet start wb-queue-lock-duration
export function wireSlowWorker() {
  wireQueueWorker({
    name: 'process-export',
    func: processExport,
    config: {
      batchSize: 1,
      // How long a worker may hold a job: milliseconds for push-based
      // backends like BullMQ (use visibilityTimeout, in seconds, for polling ones)
      lockDuration: 1800000,
    },
  })
}
// @snippet end wb-queue-lock-duration

// @snippet start wb-queue-priority-workers
export function wirePriorityWorkers() {
  // The same function on three queues, tuned differently
  wireQueueWorker({
    name: 'notifications-urgent',
    func: sendOrderConfirmation,
    config: { batchSize: 10, lockDuration: 15000, pollInterval: 1000 },
  })
  wireQueueWorker({
    name: 'notifications-normal',
    func: sendOrderConfirmation,
    config: { batchSize: 5, lockDuration: 30000, pollInterval: 5000 },
  })
  wireQueueWorker({
    name: 'notifications-low',
    func: sendOrderConfirmation,
    config: { batchSize: 2, lockDuration: 60000, pollInterval: 30000 },
  })
}
// @snippet end wb-queue-priority-workers

// @snippet start wb-queue-enqueue-by-priority
export const queueByPriority = pikkuSessionlessFunc({
  func: async (
    { queueService },
    data: {
      orderId: string
      userId: string
      priority: 'urgent' | 'normal' | 'low'
    }
  ) => {
    const { priority, ...job } = data
    // Pick the queue by priority
    return await queueService?.add(`notifications-${priority}`, job)
  },
})
// @snippet end wb-queue-enqueue-by-priority

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

// @snippet start wb-rpc-remote-call
export const remoteAvailability = pikkuSessionlessFunc({
  func: async (_services, { itemId }: { itemId: string }, { rpc }) => {
    // Runs on whichever instance hosts the function
    return await rpc.remote('checkItemAvailability', { itemId })
  },
})
// @snippet end wb-rpc-remote-call

// @snippet start wb-rpc-error-handling
export const safeBasketLookup = pikkuFunc({
  func: async ({ logger }, { sessionId }: { sessionId: string }, { rpc }) => {
    try {
      const basket = await rpc.invoke('getBasket', { sessionId })
      return { success: true, itemCount: basket.itemCount }
    } catch (error) {
      logger.error({ event: 'basket_lookup_failed', sessionId })
      return { success: false, itemCount: 0 }
    }
  },
})
// @snippet end wb-rpc-error-handling

// @snippet start wb-rpc-exposed-endpoint
// A generic caller for every function marked `expose: true`
export const rpcCaller = pikkuSessionlessFunc({
  auth: false,
  func: async (
    _services,
    { rpcName, data }: { rpcName: string; data?: unknown },
    { rpc }
  ) => {
    return await rpc.exposed(rpcName, data)
  },
})

export function wireRpcEndpoint() {
  wireHTTP({
    method: 'post',
    route: '/rpc/:rpcName',
    auth: false,
    func: rpcCaller,
  })
}
// @snippet end wb-rpc-exposed-endpoint

// @snippet start wb-rpc-deployment-start
export async function registerInstance(
  deploymentService: import('@pikku/core/services').DeploymentService,
  port: number
) {
  await deploymentService.init()
  await deploymentService.start({
    deploymentId: `server-${port}`,
    endpoint: `http://localhost:${port}`,
    functions: ['checkItemAvailability'], // exposed function names
  })

  // On shutdown, deregister
  process.on('SIGTERM', async () => {
    await deploymentService.stop()
    process.exit(0)
  })
}
// @snippet end wb-rpc-deployment-start

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

// @snippet start wb-channel-authenticate
export const authenticate = pikkuChannelFunc<
  { token: string },
  { authenticated: boolean }
>({
  func: async ({ jwt }, data, { setSession }) => {
    // Decode the token and bind the session to this connection
    const payload = await jwt!.decode<{ userId: string }>(data.token)
    await setSession?.({ userId: payload.userId, role: 'customer' })
    return { authenticated: true }
  },
  auth: false, // The authenticate action itself can't require a session
})

export const sendChatMessage = pikkuChannelFunc<
  { message: string },
  { message: string; timestamp: number }
>({
  func: async ({ logger }, data, { channel, session }) => {
    const timestamp = Date.now()
    logger.info({ room: channel.openingData, user: session?.userId })
    return { message: data.message, timestamp }
  },
  auth: true, // Requires the session set by `authenticate`
})
// @snippet end wb-channel-authenticate

// @snippet start wb-channel-authenticate-wiring
export function wireAuthChannel() {
  wireChannel({
    name: 'chat',
    route: '/chat',
    auth: true, // Channel requires auth by default
    onMessageWiring: {
      action: {
        authenticate: { func: authenticate }, // auth: false on the function
        sendMessage: { func: sendChatMessage }, // auth: true on the function
      },
    },
  })
}
// @snippet end wb-channel-authenticate-wiring

// @snippet start wb-channel-lifecycle
export const chatConnect = pikkuChannelConnectionFunc<{ welcome: string }>({
  func: async ({ logger }, _data, { channel }) => {
    logger.info({ event: 'connected', channelId: channel.channelId })
    // The return value is sent to the client
    return { welcome: 'Welcome!' }
  },
})

export const chatDisconnect = pikkuChannelDisconnectionFunc({
  func: async ({ logger }, _data, { channel }) => {
    logger.info({ event: 'disconnected', channelId: channel.channelId })
    // No return value - the connection is closing
  },
})

export const chatMessage = pikkuChannelFunc<
  { message: string },
  { message: string; timestamp: number }
>({
  func: async (_services, data) => {
    return { message: data.message, timestamp: Date.now() }
  },
})
// @snippet end wb-channel-lifecycle

// @snippet start wb-channel-lifecycle-wiring
export function wireChatChannel() {
  wireChannel({
    // Required
    name: 'chat', // Unique channel name
    route: '/chat', // WebSocket route

    // Lifecycle handlers
    onConnect: chatConnect,
    onDisconnect: chatDisconnect,
    onMessage: chatMessage,

    // Optional
    auth: true, // Require authentication (default: true)
    tags: ['realtime'],
  })
}
// @snippet end wb-channel-lifecycle-wiring

// @snippet start wb-channel-opening-data
// Client connects to: ws://localhost:3000/chat?room=general
// openingData is { room: 'general' } for the whole connection.
export const roomMessage = pikkuChannelFunc<
  { message: string },
  { room: string; message: string }
>({
  func: async (_services, data, { channel }) => {
    const { room } = channel.openingData as { room: string }
    return { room, message: data.message }
  },
})
// @snippet end wb-channel-opening-data

// @snippet start wb-channel-send
type StatusUpdate =
  | { type: 'processing'; step: string }
  | { type: 'complete'; count: number }

export const exportProgress = pikkuChannelFunc<{ jobId: string }, StatusUpdate>(
  {
    func: async ({ kysely }, _data, { channel }) => {
      // Send progress updates as you go
      channel.send({ type: 'processing', step: 'Loading data' })

      const rows = await kysely.selectFrom('order').selectAll().execute()

      // channel.send is type-checked against the Output type
      channel.send({ type: 'complete', count: rows.length })
    },
  }
)
// @snippet end wb-channel-send

// @snippet start wb-channel-room-connect
export const joinRoom = pikkuChannelConnectionFunc<{ welcome: string }>({
  func: async ({ eventHub }, _data, { channel }) => {
    const { room } = channel.openingData as { room: string }

    // Subscribe this connection to the room's topic
    await eventHub?.subscribe(`room:${room}`, channel.channelId)
    return { welcome: `Joined ${room}` }
  },
})

export const leaveRoom = pikkuChannelDisconnectionFunc({
  func: async ({ eventHub }, _data, { channel }) => {
    const { room } = channel.openingData as { room: string }
    await eventHub?.unsubscribe(`room:${room}`, channel.channelId)
  },
})
// @snippet end wb-channel-room-connect

// @snippet start wb-channel-broadcast
export const broadcastToRoom = pikkuFunc({
  func: async (
    { eventHub },
    data: { room: string; message: string },
    { session }
  ) => {
    // null = broadcast to every subscriber of the topic
    await eventHub?.publish(`room:${data.room}`, null, {
      type: 'message',
      message: data.message,
      userId: session.userId,
      timestamp: Date.now(),
    })
  },
})
// @snippet end wb-channel-broadcast

// ---------------------------------------------------------------------------
// Scheduled tasks
// ---------------------------------------------------------------------------

// @snippet start wb-cron-void-func
export const weeklyReport = pikkuVoidFunc({
  func: async ({ kysely, logger }) => {
    const { n } = await kysely
      .selectFrom('order')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()

    logger.info({ event: 'weekly_report', orders: n })
  },
  title: 'Generate the weekly report',
  tags: ['reports'],
})
// @snippet end wb-cron-void-func

// The jobs the schedule examples below point at. Each is its own function.
const logJob = (title: string) =>
  pikkuVoidFunc({
    func: async ({ logger }) => {
      logger.info({ event: 'job', title })
    },
    title,
    tags: ['jobs'],
  })
export const healthCheck = logJob('Check the system is healthy')
export const hourlyUpdate = logJob('Refresh the hourly figures')
export const dailyBackup = logJob('Back up the database')
export const monthlyBilling = logJob('Run the monthly billing')
export const cleanupOldLogs = logJob('Remove old logs')
export const updateStatistics = logJob('Recompute statistics')
export const archiveOldData = logJob('Archive old data')
export const refreshCache = logJob('Refresh the cache')
export const runMaintenance = logJob('Run routine maintenance')

// @snippet start wb-cron-manual-trigger
export function wireManualTrigger() {
  wireHTTP({
    method: 'post',
    route: '/admin/trigger-weekly-report',
    func: weeklyReport,
  })
}
// @snippet end wb-cron-manual-trigger

// @snippet start wb-cron-expressions
export function wireCronExamples() {
  // Every 5 minutes
  wireScheduler({
    name: 'healthCheck',
    schedule: '*/5 * * * *',
    func: healthCheck,
  })

  // Every hour at minute 30
  wireScheduler({
    name: 'hourlyUpdate',
    schedule: '30 * * * *',
    func: hourlyUpdate,
  })

  // Every day at 2:30 AM
  wireScheduler({
    name: 'dailyBackup',
    schedule: '30 2 * * *',
    func: dailyBackup,
  })

  // Every Monday at 9:00 AM
  wireScheduler({
    name: 'weeklyReport',
    schedule: '0 9 * * 1',
    func: weeklyReport,
  })

  // First day of every month at midnight
  wireScheduler({
    name: 'monthlyBilling',
    schedule: '0 0 1 * *',
    func: monthlyBilling,
  })
}
// @snippet end wb-cron-expressions

// @snippet start wb-cron-basic-wiring
export function wireMaintenance(maintenanceSchedule: string) {
  wireScheduler({
    // Required
    name: 'runMaintenance',
    schedule: maintenanceSchedule, // '0 2 * * *' in prod, '0 */4 * * *' in dev
    func: runMaintenance,

    // Optional
    tags: ['maintenance', 'critical'],
  })
}
// @snippet end wb-cron-basic-wiring

// @snippet start wb-cron-metrics-middleware
export const schedulerMetrics = pikkuMiddleware(
  async ({ logger }, { scheduledTask }, next) => {
    // Guard for scheduled task interaction
    if (!scheduledTask) {
      throw new InvalidMiddlewareWireError(
        'schedulerMetrics middleware can only be used with scheduled tasks'
      )
    }

    const start = Date.now()
    logger.info({ event: 'task_started', task: scheduledTask.name })

    try {
      await next()
      logger.info({
        event: 'task_completed',
        task: scheduledTask.name,
        ms: Date.now() - start,
      })
    } catch (error) {
      logger.error({
        event: 'task_failed',
        task: scheduledTask.name,
        ms: Date.now() - start,
      })
      throw error
    }
  }
)
// @snippet end wb-cron-metrics-middleware

// @snippet start wb-cron-middleware-wiring
export function wireWithMiddleware() {
  // Per schedule
  wireScheduler({
    name: 'runMaintenance',
    schedule: '0 3 * * *',
    func: runMaintenance,
    middleware: [schedulerMetrics],
  })

  // Or for every wiring, scheduled tasks included
  addGlobalMiddleware([schedulerMetrics])
}
// @snippet end wb-cron-middleware-wiring

// @snippet start wb-cron-error-handling
export const syncData = pikkuVoidFunc({
  func: async ({ kysely, logger }) => {
    try {
      await kysely.selectFrom('item').selectAll().execute()
      logger.info({ event: 'sync_ok' })
    } catch (error) {
      logger.error({ event: 'sync_failed' })

      // Throw to indicate failure
      throw error
    }
  },
  title: 'Sync external data',
})
// @snippet end wb-cron-error-handling

// @snippet start wb-cron-grouped
export function wireHousekeeping() {
  // Every hour
  wireScheduler({ name: 'cleanupOldLogs', schedule: '0 * * * *', func: cleanupOldLogs })
  // Every 6 hours
  wireScheduler({ name: 'updateStatistics', schedule: '0 */6 * * *', func: updateStatistics })
  // Daily at 2 AM
  wireScheduler({ name: 'archiveOldData', schedule: '0 2 * * *', func: archiveOldData })
  // Every 15 minutes
  wireScheduler({ name: 'refreshCache', schedule: '*/15 * * * *', func: refreshCache })
}
// @snippet end wb-cron-grouped

// @snippet start wb-cron-orchestrate
export const nightlyRun = pikkuVoidFunc({
  func: async ({ logger }, _data, { rpc }) => {
    logger.info('Starting nightly run')

    // Run several functions in sequence
    await rpc.invoke('sweepLowStock')
    await rpc.invoke('dailySalesReport')

    logger.info('Nightly run completed')
  },
  title: 'Run the nightly tasks',
})
// @snippet end wb-cron-orchestrate

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------


// @snippet start wb-gateway-handler
export const handleMessage = pikkuFunc<
  GatewayInboundMessage,
  GatewayOutboundMessage
>({
  func: async ({ logger }, { senderId, text }) => {
    logger.info({ event: 'gateway_message', senderId })
    return { text: `Got it! You said: ${text}` }
  },
  title: 'Handle incoming gateway message',
  tags: ['messaging'],
})
// @snippet end wb-gateway-handler

declare const platformAdapter: GatewayAdapter

// @snippet start wb-gateway-webhook
export function wireWhatsApp() {
  wireGateway({
    name: 'whatsapp',
    type: 'webhook',
    route: '/webhooks/whatsapp',
    adapter: platformAdapter,
    func: handleMessage,
  })
}
// @snippet end wb-gateway-webhook

// @snippet start wb-gateway-listener
export function wireSignal() {
  wireGateway({
    name: 'signal',
    type: 'listener',
    adapter: platformAdapter,
    func: handleMessage,
  })
}
// @snippet end wb-gateway-listener

// @snippet start wb-gateway-adapter-factory
declare function createWhatsAppAdapter(config: {
  accessToken: string
  phoneId: string
  verifyToken: string
}): GatewayAdapter

export function wireWhatsAppWithSecrets() {
  wireGateway({
    name: 'whatsapp',
    type: 'webhook',
    route: '/webhooks/whatsapp',
    // Resolved lazily, on the first inbound request
    adapter: async ({ secrets }) => {
      const { accessToken, phoneId, verifyToken } = (
        await secrets.getSecret<{
          accessToken: string
          phoneId: string
          verifyToken: string
        }>('WHATSAPP')
      ).reveal()
      return createWhatsAppAdapter({ accessToken, phoneId, verifyToken })
    },
    func: handleMessage,
  })
}
// @snippet end wb-gateway-adapter-factory

// @snippet start wb-gateway-middleware
export const rateLimit = pikkuMiddleware(async ({ logger }, wire, next) => {
  if (!wire.gateway) {
    throw new InvalidMiddlewareWireError('rateLimit is for gateways')
  }
  const { senderId, platform } = wire.gateway
  logger.info({ event: 'gateway_message', platform, senderId })

  // Reply directly and skip the handler when the sender is over the limit
  const overLimit = false
  if (overLimit) {
    await wire.gateway.send({ text: 'Too many messages. Please wait.' })
    return
  }
  await next()
})

export function wireSlackWithMiddleware() {
  wireGateway({
    name: 'slack',
    type: 'webhook',
    route: '/webhooks/slack',
    adapter: platformAdapter,
    func: handleMessage, // put `permissions` on handleMessage itself
    middleware: [rateLimit],
    auth: false, // Default is true
  })
}
// @snippet end wb-gateway-middleware

// @snippet start wb-gateway-service
export async function runListeners() {
  const gatewayService = new LocalGatewayService()

  // Start all registered listener gateways
  await gatewayService.start()

  // Stop them on shutdown
  await gatewayService.stop()
}
// @snippet end wb-gateway-service

// @snippet start wb-gateway-multiple
export function wireManyGateways() {
  wireGateway({
    name: 'whatsapp',
    type: 'webhook',
    route: '/webhooks/whatsapp',
    adapter: platformAdapter,
    func: handleMessage,
  })
  wireGateway({
    name: 'slack',
    type: 'webhook',
    route: '/webhooks/slack',
    adapter: platformAdapter,
    func: handleMessage,
  })
  wireGateway({
    name: 'webchat',
    type: 'websocket',
    route: '/chat',
    adapter: platformAdapter,
    func: handleMessage,
  })
}
// @snippet end wb-gateway-multiple

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// @snippet start wb-cli-parameters
export function wireCliParameters() {
  wireCLI({
    program: 'shop',
    commands: {
      item: pikkuCLICommand({
        parameters: '<itemId>',
        func: getItem,
        description: 'Show one item',
      }),
      orders: pikkuCLICommand({
        func: listOrders,
        description: 'List your orders',
      }),
    },
  })
}
// @snippet end wb-cli-parameters

// @snippet start wb-cli-nested
export function wireCliNested() {
  wireCLI({
    program: 'shop',
    commands: {
      catalogue: {
        description: 'Catalogue management',
        subcommands: {
          list: pikkuCLICommand({ func: listItems }),
          show: pikkuCLICommand({ parameters: '<itemId>', func: getItem }),
        },
      },
    },
  })
}
// @snippet end wb-cli-nested

// @snippet start wb-cli-progress
export const buildCatalogue = pikkuSessionlessFunc({
  func: async (_services, _data: null, { channel }) => {
    if (channel) {
      await channel.send({ type: 'progress', step: 'Installing', percent: 0 })
    }
    // ... work ...
    if (channel) {
      await channel.send({ type: 'progress', step: 'Compiling', percent: 50 })
    }
    // ... more work ...
  },
})
// @snippet end wb-cli-progress

// @snippet start wb-cli-remote-renderers
// A renderer for the remote CLI runs on the client: logger is the only service
export const loggerRenderer = pikkuCLIRender<{ message: string }>(
  (services, data) => {
    services.logger.info(data.message)
  }
)

// No services at all is fine too
export const plainRenderer = pikkuCLIRender<{ message: string }>((_, data) => {
  console.log(data.message)
})
// @snippet end wb-cli-remote-renderers

// ---------------------------------------------------------------------------
// AI agents
// ---------------------------------------------------------------------------

// @snippet start wb-agent-basic
export const catalogueAssistant = pikkuAgent({
  name: 'catalogue-assistant',
  description: 'A helpful assistant that browses the catalogue',
  goal: 'You help users find items in the catalogue.',
  model: 'openai/gpt-4o-mini',
  tools: [listItems, getItem],
  memory: { storage: 'agentStorage', lastMessages: 10 },
  maxSteps: 5,
})
// @snippet end wb-agent-basic

// @snippet start wb-agent-multi
export const itemFinder = pikkuAgent({
  name: 'item-finder',
  description: 'Finds items in the catalogue',
  goal: 'You help users find items.',
  model: 'openai/gpt-4o-mini',
  tools: [listItems, getItem],
})

export const orderLookup = pikkuAgent({
  name: 'order-lookup',
  description: 'Answers questions about orders',
  goal: 'You help users with their orders.',
  model: 'openai/gpt-4o-mini',
  tools: [listOrders],
})

export const mainRouter = pikkuAgent({
  name: 'main-router',
  description: 'Routes requests to specialized agents',
  goal: 'You coordinate between agents.',
  model: 'openai/gpt-4o-mini',
  agents: [itemFinder, orderLookup],
  maxSteps: 5,
})
// @snippet end wb-agent-multi

// @snippet start wb-agent-model
export const tunedAgent = pikkuAgent({
  name: 'tuned-agent',
  description: 'An agent with its model tuned',
  goal: 'Answer briefly.',
  model: 'openai/gpt-4o-mini',
  temperature: 0.3,
  maxSteps: 8,
})
// @snippet end wb-agent-model

// @snippet start wb-agent-voice
export const voiceAgent = pikkuAgent({
  name: 'voice-assistant',
  description: 'A voice-enabled assistant',
  goal: 'You help users via voice.',
  model: 'openai/gpt-4o-mini',
  tools: [listItems],
  agentMiddleware: [
    voiceInput({ language: 'en' }), // Transcribes audio attachments to text
    voiceOutput({ voice: 'alloy' }), // Synthesizes response text to audio
  ],
})
// @snippet end wb-agent-voice

// ---------------------------------------------------------------------------
// Keep imports used
// ---------------------------------------------------------------------------

export const _wbUnused = {
  z,
  getBasket,
  sweepLowStock,
  dailySalesReport,
}
