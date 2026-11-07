/**
 * One service of the distributed trace suite, as a process of its own. Every
 * service runs the same app; `DIST_ROLE` says which it is, and only the worker
 * runs queue workers. Remote addons and the mesh are real HTTP between them.
 */
import '../../.pikku/pikku-bootstrap.gen.js'
import { buildMeshHeaders } from '@pikku/core/mesh'
import {
  LocalVariablesService,
  type DeploymentService,
  type Logger,
} from '@pikku/core/services'
import { pikkuState } from '@pikku/core/state'
import type { PikkuWorkflowService } from '@pikku/core/workflow'
import { JoseJWTService } from '@pikku/jose'
import { PikkuNodeHTTPServer } from '@pikku/node-http-server'
import { BullQueueService, BullQueueWorkers } from '@pikku/queue-bullmq'
import {
  createConfig,
  createSingletonServices,
  SIGNING_KEY,
} from '../services.js'
import { record, role } from './recorder.js'

const variables = new LocalVariablesService()
const port = Number(variables.get('DIST_PORT'))
const peers = variables.get<Record<string, string>>('DIST_PEERS')!
const redis = new URL(String(variables.get('REDIS_TEST_URL')))
const connection = {
  host: redis.hostname,
  port: Number(redis.port),
  maxRetriesPerRequest: null,
}

/**
 * `BullQueueService.add` drops its connection options and so always reaches
 * localhost:6379 (bull-queue-service.ts:130). Not a trace bug: reported, and
 * handed over here so the suite can run on a port of its own.
 */
class ConnectedBullQueueService extends BullQueueService {
  protected override createQueue(name: string) {
    return super.createQueue(name, { connection })
  }
}

const logger = (scope?: string): Logger => {
  const write = (level: string) => (message: unknown) => {
    record({ kind: 'log', level, traceId: scope, at: String(message) })
    if (level === 'error') console.error(`[${role}] ${scope}`, message)
  }
  return {
    info: write('info'),
    warn: write('warn'),
    debug: () => {},
    error: write('error'),
    setLevel: () => {},
    scope: (traceId: string) => logger(traceId),
  } as Logger
}

const log = logger()
const jwt = new JoseJWTService(
  async () => [{ id: 'tracing', value: SIGNING_KEY }],
  log
)
await jwt.init()

let secrets: Parameters<typeof buildMeshHeaders>[1]

const deploymentService: DeploymentService = {
  init: async () => {},
  start: async () => {},
  stop: async () => {},
  invoke: async (funcName, data, session, traceparent) => {
    const headers = await buildMeshHeaders(
      jwt,
      secrets,
      funcName,
      session,
      traceparent
    )
    const { to } = data as { to: string }
    const response = await fetch(`${peers[to]}/mesh/rpc/${funcName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rpcName: funcName, data }),
    })
    if (!response.ok) {
      throw new Error(`Mesh call to '${funcName}' failed: ${response.status}`)
    }
    return await response.json()
  },
}

const services = await createSingletonServices(await createConfig(), {
  logger: log,
  jwt,
  deploymentService,
  queueService: new ConnectedBullQueueService(connection),
})
secrets = services.secrets

const addon = (name: string, host: string, timeoutMs: number) =>
  pikkuState(null, 'addons', 'packages').set(name, {
    package: `@pikku/verifier-${name}`,
    remote: true,
    serverUrl: peers[host],
    remoteTimeoutMs: timeoutMs,
  } as never)
addon('trusted', 'e', 5000)
addon('untrusted', 'f', 5000)
addon('impatient', 'e', 200)

const server = new PikkuNodeHTTPServer(
  { port, hostname: '127.0.0.1' } as never,
  log,
  { trustInboundTraceparent: variables.get<boolean>('DIST_TRUST') === true }
)
await server.init()
await server.start()

const workers = role.startsWith('c')
  ? new BullQueueWorkers(connection)
  : undefined
if (workers) {
  ;(services.workflowService as PikkuWorkflowService).wireQueueWorkers()
  await workers.registerQueues()
}

const shutdown = async () => {
  await workers?.close()
  await server.stop()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown())

console.log('ready')
