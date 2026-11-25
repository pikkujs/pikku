import { defineProvider } from '@pikku/core/provider'
import type { Logger } from '@pikku/core/services'
import type { NatsQueueService } from './nats-queue-service.js'
import type { NatsSchedulerService } from './nats-scheduler-service.js'
import { NatsServiceFactory } from './nats-service-factory.js'
import type { NatsServiceFactoryOptions } from './nats-service-factory.js'

const DRAIN_TIMEOUT_MS = 10_000

/**
 * Lowercase letters and digits in `-`-separated groups: legal as one NATS
 * subject token and in a stream name, and free of `_`, which joins project and
 * stage in the stream name (`pikku_<project>_<stage>`). With `-` allowed in
 * both, `a-b` + `c` and `a` + `b-c` would name the same stream.
 */
const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type NatsFactory = Pick<
  NatsServiceFactory,
  | 'init'
  | 'getQueueService'
  | 'getSchedulerService'
  | 'getQueueWorkers'
  | 'drainWorkers'
  | 'close'
>

/**
 * What the server lifecycle uses of the factory. Its `stop()` drains the
 * workers, then closes the connection, so `stopSingletonServices` ends NATS
 * cleanly without the factory itself being a singleton service.
 */
export type NatsLifecycle = {
  registerQueues(logger: Logger | undefined): Promise<unknown>
  drainWorkers(timeoutMs: number): Promise<string[]>
  close(): Promise<void>
  stop(): Promise<void>
}

export interface NatsProvided {
  queueService: NatsQueueService
  schedulerService: NatsSchedulerService
  natsLifecycle: NatsLifecycle
}

type Env = Record<string, string | undefined>

const required = (env: Env, name: string, why: string): string => {
  const value = env[name]
  if (!value) {
    throw new Error(
      `The nats service needs ${name} (${why}). It never falls back to the in-memory queue: set ${name}, or remove 'nats' from wireAddon({ services }).`
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
 * Each stage owns one JetStream stream, `pikku_<project>_<stage>`, holding
 * `pikku.<project>.<stage>.>`. Whoever runs the broker creates it up front;
 * this process never creates or changes it. The names are identical across
 * releases so a new release resumes the old one's queue. There is no anonymous
 * connection: the user and password are required.
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
    streamName: `pikku_${project}_${stage}`,
    subjectPrefix: `pikku.${project}.${stage}`,
    attachToStream: true,
    inboxPrefix: `_INBOX.${project}.${stage}`,
    user,
    pass,
    name: `pikku-${project}-${stage}`,
  }
}

/**
 * Connects to the stage's stream and provides the queue and scheduler over it.
 * Fails before connecting when the environment is incomplete.
 */
export const connectNats = async (
  logger: Logger | undefined,
  env: Env,
  newFactory: (options: NatsServiceFactoryOptions) => NatsFactory = (options) =>
    new NatsServiceFactory(options)
): Promise<NatsProvided> => {
  const factory = newFactory(natsOptionsFromEnv(env))
  await factory.init()
  const natsLifecycle: NatsLifecycle = {
    registerQueues: (registerLogger) =>
      factory.getQueueWorkers().registerQueues(registerLogger),
    drainWorkers: (timeoutMs) => factory.drainWorkers(timeoutMs),
    close: () => factory.close(),
    async stop() {
      try {
        const unfinished = await factory.drainWorkers(DRAIN_TIMEOUT_MS)
        if (unfinished.length > 0) {
          logger?.warn(
            `NATS queues still had jobs in flight after ${DRAIN_TIMEOUT_MS}ms: ${unfinished.join(', ')}. They are redelivered after ack_wait.`
          )
        }
      } finally {
        await factory.close()
      }
    },
  }
  return {
    queueService: factory.getQueueService(),
    schedulerService: factory.getSchedulerService(),
    natsLifecycle,
  }
}

/**
 * What `pikku dev` runs in place of NATS: nothing to connect, nothing to drain.
 * `pikku dev` keeps its in-memory queue and scheduler, so only the lifecycle
 * the server start and stop hooks read is provided.
 */
const devNatsLifecycle: NatsLifecycle = {
  registerQueues: async () => undefined,
  drainWorkers: async () => [],
  close: async () => undefined,
  stop: async () => undefined,
}

/**
 * Standalone deploys put a stage on its own JetStream stream. `pikku dev` keeps
 * its in-memory queue; an app opts in with
 * `wireAddon({ providers: ['nats'] })` and builds it for a target that runs the
 * server lifecycle.
 *
 * Queue workers register once the server starts. Teardown is
 * `natsLifecycle.stop()`.
 */
export const nats = defineProvider({
  dev: () => ({ natsLifecycle: devNatsLifecycle }),
  deploy: async ({ logger }, env) => connectNats(logger, env),
  async onServerStart(services) {
    const lifecycle: NatsLifecycle = services.natsLifecycle
    await lifecycle.registerQueues(services.logger)
  },
})
