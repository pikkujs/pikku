import type { Contributor } from '@pikku/core/contributors'
import type { Logger } from '@pikku/core/services'
import { NatsServiceFactory } from './nats-service-factory.js'
import type { NatsServiceFactoryOptions } from './nats-service-factory.js'

const DRAIN_TIMEOUT_MS = 10_000

/** Lowercase letters, digits, `-` and `_`: legal in a stream name and in one subject token. */
const SLUG = /^[a-z0-9][a-z0-9_-]*$/

type NatsFactory = Pick<
  NatsServiceFactory,
  | 'init'
  | 'getQueueService'
  | 'getSchedulerService'
  | 'getQueueWorkers'
  | 'drainWorkers'
  | 'close'
>

/** What the lifecycle hooks use of the factory, under no `stop` name. */
type NatsLifecycle = {
  registerQueues(logger: Logger | undefined): Promise<unknown>
  drainWorkers(timeoutMs: number): Promise<string[]>
  close(): Promise<void>
}

type Env = Record<string, string | undefined>

const required = (env: Env, name: string, why: string): string => {
  const value = env[name]
  if (!value) {
    throw new Error(
      `The nats contributor needs ${name} (${why}). It never falls back to the in-memory queue: set ${name}, or remove 'nats' from wireContributors.`
    )
  }
  return value
}

/**
 * The stream and subject prefix are named after the app, not the release, so
 * two releases of one app share the same queues and a redeploy resumes them.
 */
export const natsOptionsFromEnv = (env: Env): NatsServiceFactoryOptions => {
  const servers = required(env, 'NATS_URL', 'the NATS server to connect to')
  const slug = required(
    env,
    'PIKKU_APP_SLUG',
    'names the stream and subject prefix, identical across releases'
  )
  if (!SLUG.test(slug)) {
    throw new Error(
      `PIKKU_APP_SLUG '${slug}' is not usable in a NATS stream name: use lowercase letters, digits, '-' and '_', starting with a letter or digit.`
    )
  }
  return {
    servers: servers.split(',').map((s) => s.trim()),
    streamName: `pikku-${slug}`,
    subjectPrefix: `pikku.${slug}`,
    ...(env.NATS_TOKEN ? { token: env.NATS_TOKEN } : {}),
    ...(env.NATS_USER ? { user: env.NATS_USER } : {}),
    ...(env.NATS_PASSWORD ? { pass: env.NATS_PASSWORD } : {}),
    name: `pikku-${slug}`,
  }
}

export const createNatsDeploy = (
  newFactory: (options: NatsServiceFactoryOptions) => NatsFactory = (options) =>
    new NatsServiceFactory(options)
): Contributor => ({
  provides: ['queueService', 'schedulerService', 'natsLifecycle'],
  when: (platform) => platform.needsQueue,
  async run(services, env) {
    const factory = newFactory(natsOptionsFromEnv(env))
    await factory.init()
    services.queueService = factory.getQueueService()
    services.schedulerService = factory.getSchedulerService()
    // Not the factory itself: it has a `stop()`, and the server stops every
    // singleton service that has one before the stop hooks run. That would
    // close the workers before `onServerStop` could drain them.
    const lifecycle: NatsLifecycle = {
      registerQueues: (logger) =>
        factory.getQueueWorkers().registerQueues(logger),
      drainWorkers: (timeoutMs) => factory.drainWorkers(timeoutMs),
      close: () => factory.close(),
    }
    services.natsLifecycle = lifecycle
  },
  async onServerStart(services) {
    const lifecycle: NatsLifecycle = services.natsLifecycle
    await lifecycle.registerQueues(services.logger)
  },
  async onServerStop(services) {
    const lifecycle: NatsLifecycle = services.natsLifecycle
    const unfinished = await lifecycle.drainWorkers(DRAIN_TIMEOUT_MS)
    if (unfinished.length > 0) {
      services.logger?.warn(
        `NATS queues still had jobs in flight after ${DRAIN_TIMEOUT_MS}ms: ${unfinished.join(', ')}. They are redelivered after ack_wait.`
      )
    }
    await lifecycle.close()
  },
})

export const natsDeploy = createNatsDeploy()
