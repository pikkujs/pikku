/**
 * Azure Functions handler factories — mirrors Lambda/CF handler factories.
 *
 * Creates handlers for Azure Functions v4 programming model:
 * - HTTP triggers (HttpRequest → HttpResponseInit)
 * - Storage Queue triggers (QueueItem → void)
 * - Timer triggers (Timer → void)
 *
 * Services are cached across invocations within the same function app instance.
 */

import { LocalVariablesService, LocalSecretService } from '@pikku/core/services'
import type { CoreSingletonServices } from '@pikku/core'
import { PikkuFetchHTTPResponse, fetchData } from '@pikku/core/http'
import { runQueueJob } from '@pikku/core/queue'
import type { QueueJob, QueueJobStatus } from '@pikku/core/queue'
import { runScheduledTask, getScheduledTasks } from '@pikku/core/scheduler'
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
  Timer,
} from '@azure/functions'

export interface AzureServiceFactories {
  createConfig: (
    variables: LocalVariablesService,
    ...args: unknown[]
  ) => Promise<unknown>
  createSingletonServices: (
    config: unknown,
    existingServices?: Partial<Record<string, unknown>>
  ) => Promise<CoreSingletonServices>
  createPlatformServices?: () =>
    | Record<string, unknown>
    | Promise<Record<string, unknown>>
}

let cachedServices: CoreSingletonServices | null = null

async function setupServices(
  factories: AzureServiceFactories
): Promise<CoreSingletonServices> {
  if (cachedServices) return cachedServices
  const variables = new LocalVariablesService(
    process.env as Record<string, string | undefined>
  )
  const config = await factories.createConfig(variables)
  const secrets = new LocalSecretService(variables)

  const platformServices = factories.createPlatformServices
    ? await factories.createPlatformServices()
    : {}

  cachedServices = await factories.createSingletonServices(config, {
    variables,
    secrets,
    ...platformServices,
  })
  return cachedServices
}

/**
 * Creates combined Azure Function handlers based on which handler types
 * the unit needs. Returns an object with named handler functions that
 * the entry file registers via app.http(), app.storageQueue(), app.timer().
 */
export function createAzureHandler(
  factories: AzureServiceFactories,
  handlerTypes: string[]
) {
  const result: Record<string, unknown> = {}

  if (handlerTypes.includes('fetch')) {
    result.http = async (
      request: HttpRequest,
      _context: InvocationContext
    ): Promise<HttpResponseInit> => {
      await setupServices(factories)

      // Convert Azure HttpRequest to standard Request
      const body =
        request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.text()
          : undefined
      const webRequest = new Request(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body,
      })

      const response = new PikkuFetchHTTPResponse()
      try {
        await fetchData(webRequest, response)
      } catch (err) {
        console.error('Azure HTTP handler: fetchData error', err)
      }

      const fetchResponse = response.toResponse()
      const headers: Record<string, string> = {}
      fetchResponse.headers.forEach((value, key) => {
        headers[key] = value
      })

      return {
        status: fetchResponse.status,
        headers,
        body: await fetchResponse.text(),
      }
    }
  }

  if (handlerTypes.includes('queue')) {
    result.queue = async (
      queueItem: unknown,
      context: InvocationContext
    ): Promise<void> => {
      await setupServices(factories)

      let data: Record<string, unknown>
      if (typeof queueItem === 'string') {
        try {
          data = JSON.parse(queueItem)
        } catch {
          data = { body: queueItem }
        }
      } else {
        data = queueItem as Record<string, unknown>
      }

      const queueName =
        (data.queueName as string) ??
        context.triggerMetadata?.queueTrigger ??
        'unknown'

      const job: QueueJob = {
        queueName,
        data: data.data ?? data,
        id: context.invocationId,
        status: async () => 'active' as QueueJobStatus,
        metadata: () => ({
          processedAt: new Date(),
          attemptsMade: (context.triggerMetadata?.dequeueCount as number) ?? 0,
          maxAttempts: undefined,
          result: undefined,
          progress: 0,
          createdAt: new Date(),
          completedAt: undefined,
          failedAt: undefined,
          error: undefined,
        }),
        waitForCompletion: async () => {
          throw new Error(
            'Azure Storage Queues do not support waitForCompletion'
          )
        },
      }

      await runQueueJob({ job })
    }
  }

  if (handlerTypes.includes('scheduled')) {
    result.timer = async (
      _timer: Timer,
      _context: InvocationContext
    ): Promise<void> => {
      await setupServices(factories)
      const traceId = `cron-${crypto.randomUUID()}`
      const scheduledTasks = getScheduledTasks()
      for (const [name] of scheduledTasks) {
        await runScheduledTask({ name, traceId })
      }
    }
  }

  return result
}

/**
 * Creates an Azure Function handler with an HTTP trigger for gateway units.
 */
export function createAzureWorkerHandler(factories: AzureServiceFactories) {
  const handlers = createAzureHandler(factories, ['fetch'])
  return handlers
}

/**
 * Creates Azure Function handlers for WebSocket channel units.
 * Uses HTTP negotiation endpoint for Azure Web PubSub.
 */
export function createAzureWebSocketHandler(_factories: AzureServiceFactories) {
  return {
    async negotiate(
      _request: HttpRequest,
      _context: InvocationContext
    ): Promise<HttpResponseInit> {
      // Web PubSub negotiation — to be implemented with @azure/web-pubsub
      return {
        status: 501,
        body: 'WebSocket via Azure Web PubSub not yet implemented',
      }
    },
  }
}
