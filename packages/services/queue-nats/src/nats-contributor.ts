import type { Contributor } from '@pikku/core/contributors'
import type { Logger } from '@pikku/core/services'
import { NatsServiceFactory } from './nats-service-factory.js'
import type { NatsServiceFactoryOptions } from './nats-service-factory.js'

const DRAIN_TIMEOUT_MS = 10_000

/**
 * Lowercase letters and digits in `-`-separated groups: legal as one NATS
 * subject token and in a consumer name, and free of `_`, which separates the
 * project from the stage in a consumer name (`<project>_<stage>_<queue>`).
 * With `-` allowed in both, `a-b` + `c` and `a` + `b-c` would share a prefix.
 */
const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The shared stream's name unless `NATS_STREAM` says otherwise. */
const DEFAULT_STREAM = 'PIKKU'

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

const token = (env: Env, name: string, what: string): string => {
  const value = required(env, name, what)
  if (!TOKEN.test(value) || value.length > 63) {
    throw new Error(
      `${name} '${value}' is not usable in a NATS subject: use lowercase letters and digits, with single '-' between them (at most 63 characters).`
    )
  }
  return value
}

/**
 * Everything the app needs from its environment, and nothing it can do without.
 *
 * The app is one tenant of a shared broker. Its subjects are
 * `pikku.<project>.<stage>.>` and its consumers are named
 * `<project>_<stage>_<queue>`, both identical across releases so a new
 * release resumes the old one's queue. The stream is shared, created by
 * whoever runs the broker, and this process never creates or changes it.
 * There is no anonymous connection: the user and password are required.
 */
export const natsOptionsFromEnv = (env: Env): NatsServiceFactoryOptions => {
  const servers = required(env, 'NATS_URL', 'the NATS server to connect to')
  const user = required(env, 'NATS_USER', 'the broker user for this stage')
  const pass = required(
    env,
    'NATS_PASSWORD',
    'the broker password for this stage'
  )
  const project = token(
    env,
    'PIKKU_PROJECT',
    'names the project in subjects and consumers'
  )
  const stage = token(
    env,
    'PIKKU_STAGE',
    'names the stage in subjects and consumers'
  )
  return {
    servers: servers.split(',').map((s) => s.trim()),
    streamName: env.NATS_STREAM || DEFAULT_STREAM,
    subjectPrefix: `pikku.${project}.${stage}`,
    attachToStream: true,
    consumerNamePrefix: `${project}_${stage}_`,
    inboxPrefix: `_INBOX.${project}.${stage}`,
    user,
    pass,
    name: `pikku-${project}-${stage}`,
  }
}

export const createNatsDeploy = (
  newFactory: (options: NatsServiceFactoryOptions) => NatsFactory = (options) =>
    new NatsServiceFactory(options)
): Contributor => ({
  provides: ['queueService', 'schedulerService', 'natsLifecycle'],
  // Only a standalone deploy, and only when it uses the queue. The platform
  // names the provider on every deploy build and never on `pikku dev`, so the
  // same app built for Cloudflare, or run in dev, keeps its in-memory queue
  // even though its source opts in. Absent the provider, this is not applied.
  when: (platform) => platform.needsQueue && platform.provider === 'standalone',
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
