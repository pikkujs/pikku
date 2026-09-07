export interface RemoteJobsGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate the remote-jobs inbox: the HTTP routes an external dispatcher posts
 * to so a runtime that holds neither a queue consumer nor a clock still runs
 * its queue workers and scheduled tasks.
 *
 * Ordinary `wireHTTP` routes rather than runtime-level handlers, so every
 * runtime serves them from one implementation, and the secret check is
 * middleware a deployment can sit its own scheme in front of.
 */
export const serializeRemoteJobs = (
  leaf: (name: string) => string
): RemoteJobsGenOutput => {
  const schemas = `/**
 * Auto-generated remote job inbox schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

export const RemoteQueueJob = z.object({
  queueName: z.string(),
  data: z.unknown().optional(),
  jobId: z.string().optional(),
  traceId: z.string().optional(),
})

export const RemoteScheduledJob = z.object({
  taskName: z.string(),
})
`

  const functions = `/**
 * Auto-generated remote job inbox
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, type SingletonServices } from '${leaf('function')}'
import { pikkuMiddleware } from '${leaf('middleware')}'
import { wireHTTP } from '${leaf('http')}'
import { type PikkuWire } from '@pikku/core/types'
import { runQueueJob, type QueueJob } from '@pikku/core/queue'
import { runScheduledTask } from '@pikku/core/scheduler'
import { BadRequestError, UnauthorizedError } from '@pikku/core/errors'
import { RemoteQueueJob, RemoteScheduledJob } from './remote-jobs.schemas.gen.js'

interface RemoteJobsWire extends PikkuWire {
  http?: { request?: { header?: (name: string) => string | undefined | null } }
}

const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Fails closed: an unset secret rejects every caller, so the inbox is never
 * open just because the deployment forgot to configure it.
 */
const remoteJobsSecretMiddleware = pikkuMiddleware(
  async ({ variables }: SingletonServices, { http }: RemoteJobsWire, next) => {
    const expected = variables?.get?.('PIKKU_DISPATCH_SECRET') as string | undefined
    const provided = http?.request?.header?.('x-pikku-dispatch')
    if (!expected || typeof provided !== 'string' || !safeEqual(provided, expected)) {
      throw new UnauthorizedError('invalid dispatch secret')
    }
    return next()
  }
)

/**
 * A dispatched job is delivered, not owned: the sender retries, so a permanent
 * failure has to read differently from a transient one. An unknown worker or a
 * discarded job answers 4xx so the sender stops; anything else propagates as
 * 5xx and is delivered again.
 */
const runRemoteQueueJob = pikkuSessionlessFunc({
  auth: false,
  input: RemoteQueueJob,
  tags: ['pikku'],
  description: 'Runs one queue worker for a job delivered by an external dispatcher.',
  func: async ({ logger }, body) => {
    const job: QueueJob = {
      queueName: body.queueName,
      data: body.data,
      id: body.jobId ?? body.traceId ?? \`remote-\${Date.now()}\`,
      status: async () => 'active',
      metadata: () => ({
        processedAt: new Date(),
        attemptsMade: 0,
        maxAttempts: undefined,
        result: undefined,
        progress: 0,
        createdAt: new Date(),
        completedAt: undefined,
        failedAt: undefined,
        error: undefined,
      }),
      waitForCompletion: async () => {
        throw new Error('remote jobs do not support waitForCompletion')
      },
    }
    try {
      await runQueueJob({ job, traceId: body.traceId })
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Error'
      if (name === 'PikkuMissingMetaError' || name === 'QueueJobDiscardedError') {
        throw new BadRequestError(err instanceof Error ? err.message : String(err))
      }
      logger.error(
        \`remote-jobs: queue '\${body.queueName}' failed: \${err instanceof Error ? err.message : String(err)}\`
      )
      throw err
    }
  },
})

const runRemoteScheduledJob = pikkuSessionlessFunc({
  auth: false,
  input: RemoteScheduledJob,
  tags: ['pikku'],
  description: 'Runs one scheduled task for a tick delivered by an external scheduler.',
  func: async ({ logger }, body) => {
    try {
      await runScheduledTask({ name: body.taskName, traceId: \`cron-\${body.taskName}\` })
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Error'
      if (name === 'ScheduledTaskNotFoundError') {
        throw new BadRequestError(err instanceof Error ? err.message : String(err))
      }
      logger.error(
        \`remote-jobs: task '\${body.taskName}' failed: \${err instanceof Error ? err.message : String(err)}\`
      )
      throw err
    }
  },
})

wireHTTP({
  method: 'post',
  route: '/__pikku/queue-job',
  auth: false,
  tags: ['pikku'],
  func: runRemoteQueueJob,
  middleware: [remoteJobsSecretMiddleware],
})

wireHTTP({
  method: 'post',
  route: '/__pikku/scheduler-job',
  auth: false,
  tags: ['pikku'],
  func: runRemoteScheduledJob,
  middleware: [remoteJobsSecretMiddleware],
})
`

  return { schemas, functions }
}
