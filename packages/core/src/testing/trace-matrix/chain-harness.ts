import { addFunction } from '../../function/function-runner.js'
import type { CoreSingletonServices } from '../../types/core.types.js'
import { beginChanges } from '../../function/abort-scope.js'
import {
  ConflictError,
  UnprocessableContentError,
} from '../../errors/errors.js'
import { pikkuMeshAuthMiddleware } from '../../middleware/mesh-auth.js'
import { RecordingTracer } from '../recording-tracer.js'
import { pikkuState } from '../../pikku-state.js'
import { httpRouter } from '../../wirings/http/routers/http-router.js'
import {
  fetch as pikkuFetch,
  wireHTTP,
} from '../../wirings/http/http-runner.js'
import { wireChannel } from '../../wirings/channel/channel-runner.js'
import { runLocalChannel } from '../../wirings/channel/local/local-channel-runner.js'
import { runMCPTool } from '../../wirings/mcp/mcp-runner.js'
import { runCLICommand } from '../../wirings/cli/cli-runner.js'
import { runQueueJob } from '../../wirings/queue/queue-runner.js'
import { runScheduledTask } from '../../wirings/scheduler/scheduler-runner.js'
import {
  createListenerMessageHandler,
  wireGateway,
} from '../../wirings/gateway/gateway-runner.js'
import { rpcService } from '../../wirings/rpc/rpc-runner.js'
import { PikkuTriggerService } from '../../wirings/trigger/pikku-trigger-service.js'
import { buildToolDefs } from '../../wirings/agent/agent-prepare.js'
import {
  QueueJobDiscardedError,
  type QueueJob,
  type QueueService,
  type JobOptions,
} from '../../wirings/queue/index.js'
import {
  continueTrace,
  traceWire,
  tracedLogger,
  type TraceContext,
} from '../../trace.js'
import { QueuedWorkflowHarness } from '../service-tests/queued-workflow-harness.js'
import { ScheduledSleeps, defineRun } from './workflow-cases.js'
import type {
  Hop,
  Inbound,
  Outcome,
  Start,
  Step,
  Timing,
  Workflow,
} from './dimensions.js'
import { TRANSPORTS, type EncodedJob } from './transports.js'
import type { Adapter } from './dimensions.js'

type SleepWake = { runId: string; stepId: string }

/** Runtime-specific paths are not here: Workers and Lambda stay mocked in their own packages. */
export type ChainCombo = {
  start: Start
  hop: Hop
  outcome: Outcome
  inbound?: Inbound
  timing?: Timing
  /** Chains to run at once, when two is not enough. */
  instances?: number
  adapter?: Adapter
  workflow?: string
  step?: string
}

export type LogEntry = {
  level: 'info' | 'warn' | 'error' | 'debug'
  /** The trace the logger was scoped to, if it was. */
  scope?: string
  message: unknown
}

/** What one started chain saw. A combo runs one, or two when timing overlaps them. */
export type Instance = {
  index: number
  sent?: string
  /** The caller itself was told of a failure, not only a job behind it. */
  callerRefused?: boolean
  /** The caller's own span, for a start that is called rather than delivered. */
  caller?: TraceContext
  /** Spans between an entry and a target, such as a scheduler's worker. */
  relays: TraceContext[]
  /** The wire trace at every run of the next hop, in order. */
  targets: TraceContext[]
  /** The `traceparent` the hop put on the wire. */
  outgoing: string[]
  errorId?: string
  /** Every span the entry ran as: one per delivery of a job. */
  entries: TraceContext[]
  /** `errorId` from the far side of a mesh hop. */
  calleeErrorId?: string
  failure?: unknown
  entryFinishedAt?: number
  targetStartedAt: number[]
  runId?: string
  job?: EncodedJob
}

const VALID = (index: number) => {
  const id = (index + 1).toString(16)
  return `00-${id.padStart(32, 'a')}-${id.padStart(16, 'b')}-01`
}
/**
 * Well formed and wrong: all-zero ids and an unknown version. A trace name a
 * caller can type but no real tracer would send.
 */
const FORGED = [
  `00-${'0'.repeat(32)}-${'b'.repeat(16)}-01`,
  `ff-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
]

const MESH_SECRET = 'matrix-mesh-secret-of-a-sufficient-length-0123456789'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Starts whose function runs before a failure can be told from the wire alone. */
export const inboundContinues = (start: Start, inbound: Inbound) =>
  inbound === 'valid' &&
  ['http', 'queue-job', 'schedule', 'agent-tool'].includes(start)

const sessionless = (name: string, extra: object = {}) =>
  ({
    name,
    pikkuFuncId: name,
    sessionless: true,
    inputSchemaName: null,
    outputSchemaName: null,
    ...extra,
  }) as never

/**
 * Runs a chain — a start, one hop, an outcome — through the real runners, with
 * brokers and the network replaced by in-process stand-ins that keep their wire
 * format. Nothing here decides a trace: every id comes from the code under test.
 */
export class TraceChain {
  readonly logs: LogEntry[] = []
  readonly tracer = new RecordingTracer()
  readonly h = new QueuedWorkflowHarness(new ScheduledSleeps())
  readonly instances: Instance[]
  private pending: Array<{
    index: number
    queueName: string
    encoded: EncodedJob
    options?: JobOptions
    id: string
  }> = []
  private scheduled: Array<{
    index: number
    rpc: string
    traceparent?: string
  }> = []
  /** Sleep wake-ups armed through the scheduler. */
  readonly sleeps: Array<{
    data: { runId: string; stepId: string }
    traceparent?: string
  }> = []
  private settlers = new Map<number, ReturnType<typeof defineRun>>()
  private readonly transport
  private readonly fetchBefore = globalThis.fetch
  private jobIds = 0
  readonly timing: Timing
  readonly inbound: Inbound
  private readonly outcome: Outcome

  constructor(readonly combo: ChainCombo) {
    this.timing = combo.timing ?? 'immediate'
    this.inbound = combo.inbound ?? 'none'
    this.outcome = combo.outcome
    this.transport = TRANSPORTS[combo.adapter ?? 'in-memory']
    const overlaps =
      this.timing === 'slow-overlap' || this.timing === 'concurrent-starts'
    const length = combo.instances ?? (overlaps ? 2 : 1)
    this.instances = Array.from({ length }, (_, index) => ({
      index,
      sent: this.inboundFor(index),
      relays: [],
      entries: [],
      targets: [],
      outgoing: [],
      targetStartedAt: [],
    }))
    this.installServices()
    if (combo.start === 'agent-tool' && this.inbound === 'valid') {
      for (const instance of this.instances) {
        instance.caller = continueTrace(instance.sent)
      }
    }
    for (const instance of this.instances) this.wire(instance)
    httpRouter.initialize()
    if (this.usesFetch) this.installFetch()
  }

  private inboundFor(index: number) {
    switch (this.inbound) {
      case 'none':
        return undefined
      case 'valid':
        return VALID(index)
      case 'invalid':
        return `not-a-traceparent-${index}`
      case 'forged':
        return FORGED[index % FORGED.length]
    }
  }

  private get usesFetch() {
    return this.combo.hop === 'remote-addon'
  }

  private logger(scope?: string): any {
    const write = (level: LogEntry['level']) => (message: unknown) => {
      this.logs.push({ level, scope, message })
    }
    return {
      info: write('info'),
      warn: write('warn'),
      error: write('error'),
      debug: write('debug'),
      scope: (id: string) => this.logger(id),
    }
  }

  private installServices() {
    const self = this
    const workflowQueue = this.singletons.queueService
    const queueService: QueueService = {
      supportsResults: false,
      add: async (queueName: string, data: any, options?: JobOptions) => {
        if (!/^q-\d+$/.test(queueName)) {
          return workflowQueue!.add(queueName, data, options)
        }
        const index = Number(queueName.split('-').at(-1))
        const id = `job-${++self.jobIds}`
        self.pending.push({
          index,
          queueName,
          encoded: self.transport.encode(data, options),
          options,
          id,
        })
        return id
      },
      getJob: async () => null,
    }
    const schedulerService = {
      scheduleRPC: async (
        _delay: unknown,
        rpc: string,
        _data: unknown,
        _session: unknown,
        traceparent?: string
      ) => {
        if (rpc === this.h.ws['getConfig']().sleeperRPCName) {
          this.sleeps.push({ data: _data as SleepWake, traceparent })
          return 'sleep'
        }
        this.scheduled.push({
          index: Number(rpc.split('-').at(-1)),
          rpc,
          traceparent,
        })
        return 'task'
      },
    }
    const deploymentService = {
      invoke: (name: string, data: unknown, _s: unknown, tp?: string) =>
        this.callMesh(name, data, tp),
    }
    pikkuState(null, 'package', 'singletonServices', {
      logger: this.logger(),
      tracer: this.tracer,
      config: {},
      queueService,
      schedulerService,
      deploymentService,
      workflowService: this.h.ws,
      secrets: {
        getSecret: async () => ({ reveal: () => MESH_SECRET }),
      },
      jwt: {
        decode: async (token: string) => {
          if (token !== 'good') throw new Error('bad signature')
          return { aud: 'pikku-mesh' }
        },
      },
      schema: {
        compileSchema: async () => {},
        getSchemaNames: () => new Set(),
        validateSchema: async (key: string) => {
          if (key.includes('Refused')) {
            throw new UnprocessableContentError('schema refused the data')
          }
        },
      },
    } as never)
  }

  private async callMesh(name: string, data: unknown, traceparent?: string) {
    const index = Number(name.split('-').at(-1))
    const instance = this.instances[index]!
    if (traceparent) instance.outgoing.push(traceparent)
    const response = await pikkuFetch(
      new Request(`http://mesh/mesh/rpc/${name}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization:
            this.outcome === 'auth-mesh-jwt' ? 'Bearer forged' : 'Bearer good',
          ...(traceparent ? { traceparent } : {}),
        },
        body: JSON.stringify(data ?? {}),
      })
    )
    const body: any = await response.json().catch(() => undefined)
    if (!response.ok) {
      instance.calleeErrorId = body?.errorId
      throw new ConflictError(`mesh answered ${response.status}`)
    }
    return body
  }

  private installFetch() {
    const answer = async (url: string, init: RequestInit) => {
      const index = Number(/far-(\d)/.exec(url)?.[1])
      const instance = this.instances[index]!
      const traceparent = (init.headers as Record<string, string>).traceparent
      if (traceparent) instance.outgoing.push(traceparent)
      switch (this.outcome) {
        case 'remote-4xx':
          return new Response('{"name":"NotARegisteredError"}', { status: 404 })
        case 'remote-5xx':
          return new Response('nope', { status: 503 })
        case 'remote-network':
          throw new TypeError('connection refused')
        case 'remote-timeout':
          return new Promise<Response>((_, reject) => {
            init.signal!.addEventListener('abort', () =>
              reject(init.signal!.reason)
            )
          })
        default:
          return Response.json({ ok: true })
      }
    }
    globalThis.fetch = ((url: string, init: RequestInit) =>
      answer(String(url), init)) as typeof fetch
  }

  /** Restores what the constructor replaced. Call in a `finally`. */
  dispose() {
    globalThis.fetch = this.fetchBefore
  }

  private wire(instance: Instance) {
    const { index } = instance
    const target = `target-${index}`
    const entry = `entry-${index}`
    const entryFunc = async (services: any, data: unknown, wire: any) => {
      instance.entries.push(wire.trace)
      await this.hop(instance, services, wire)
      if (this.entryFails) await this.failTarget()
      if (this.timing === 'enqueue-before-fail') {
        throw new ConflictError('failed just after enqueuing')
      }
      this.finishEntry(instance)
      return { ok: true }
    }
    this.register(entry, entryFunc, {
      schema: this.entryFails && this.isSchemaOutcome,
    })
    this.register(
      target,
      async (_s: any, _d: unknown, wire: any) => {
        instance.targets.push(wire.trace)
        instance.targetStartedAt.push(performance.now())
        if (this.timing === 'slow-overlap') await delay(2 - index)
        if (
          this.timing === 'retry-backoff' &&
          this.outcome === 'success' &&
          instance.targets.length === 1
        ) {
          throw new Error('flaky')
        }
        if (!this.entryFails) await this.failTarget()
        return { ok: true }
      },
      {
        permissions: this.outcome === 'permission-denied',
        schema: !this.entryFails && this.isSchemaOutcome,
      }
    )
    pikkuState(null, 'rpc', 'meta')[target] = target
    this.wireStart(instance, entry, entryFunc)
    this.wireHop(instance, target)
  }

  /**
   * Where the outcome lands: on the entry when the next hop runs nothing of
   * ours, or when it is about the job the chain started as. Otherwise on the
   * next function.
   */
  private get entryFails() {
    const { hop, start } = this.combo
    return (
      hop === 'remote-addon' ||
      (start === 'queue-job' &&
        hop !== 'enqueue' &&
        this.outcome.startsWith('job-'))
    )
  }

  /** An HTTP route refusing a forged mesh token, before any function runs. */
  get meshGuardsEntry() {
    return this.outcome === 'auth-mesh-jwt' && this.combo.hop !== 'mesh'
  }

  private get isSchemaOutcome() {
    return this.outcome === 'schema-invalid' || this.outcome === 'job-poison'
  }

  private finishEntry(instance: Instance) {
    instance.entryFinishedAt = performance.now()
  }

  private register(
    name: string,
    func: (...args: any[]) => any,
    { permissions, schema }: { permissions?: boolean; schema?: boolean } = {}
  ) {
    addFunction(name, {
      func,
      auth: false,
      ...(permissions
        ? {
            permissions: {
              refuse: async () => {
                return false
              },
            },
          }
        : {}),
    } as never)
    const inputSchemaName = schema ? 'Refused' : 'Accepted'
    pikkuState(null, 'function', 'meta')[name] = sessionless(name, {
      inputSchemaName,
    })
    pikkuState(null, 'misc', 'schemas').set(inputSchemaName, {} as never)
  }

  private async failTarget() {
    switch (this.outcome) {
      case 'throw-pikku-error':
        throw new ConflictError('refused')
      case 'throw-plain-error':
      case 'job-exhausted':
        throw new Error('boom')
      case 'job-discarded':
        throw new QueueJobDiscardedError('job', 'not wanted')
      case 'abandoned':
        await beginChanges({ abandoned: true, reason: 'the caller left' })
    }
  }

  private wireStart(
    instance: Instance,
    entry: string,
    func: (...args: any[]) => any
  ) {
    const { index } = instance
    switch (this.combo.start) {
      case 'http': {
        const route = `/entry-${index}`
        const http = pikkuState(null, 'http', 'meta')
        http.post[route] = {
          pikkuFuncId: entry,
          route,
          method: 'post',
        } as never
        wireHTTP({
          route,
          method: 'post',
          auth: false,
          ...(this.meshGuardsEntry
            ? { middleware: [pikkuMeshAuthMiddleware] }
            : {}),
          func: { func, auth: false },
        } as never)
        return
      }
      case 'channel':
        pikkuState(null, 'channel', 'meta')[entry] = {
          name: entry,
          route: `/channel-${index}`,
          messageWirings: { action: { go: { pikkuFuncId: entry } } },
        } as never
        wireChannel({
          name: entry,
          route: `/channel-${index}`,
          onMessageWiring: { action: { go: { func, auth: false } } },
        } as never)
        return
      case 'mcp':
        pikkuState(null, 'mcp', 'toolsMeta')[entry] = {
          pikkuFuncId: entry,
        } as never
        return
      case 'cli':
        pikkuState(null, 'cli', 'meta', {
          programs: {
            ...pikkuState(null, 'cli', 'meta')?.programs,
            [entry]: {
              program: entry,
              commands: {
                go: {
                  command: 'go',
                  pikkuFuncId: entry,
                  positionals: [],
                  options: {},
                },
              },
              options: {},
            },
          },
          renderers: {},
        } as never)
        pikkuState(null, 'cli', 'programs', {
          ...pikkuState(null, 'cli', 'programs'),
          [entry]: { middleware: [], renderers: {} },
        } as never)
        return
      case 'gateway':
        wireGateway(this.gatewayConfig(entry, func) as never)
        return
      case 'queue-job':
        pikkuState(null, 'queue', 'meta')[`job-${index}`] = {
          pikkuFuncId: entry,
        } as never
        pikkuState(null, 'queue', 'registrations').set(`job-${index}`, {
          name: `job-${index}`,
          func: {},
        } as never)
        return
      case 'schedule':
        pikkuState(null, 'scheduler', 'meta')[entry] = {
          name: entry,
          pikkuFuncId: entry,
          schedule: '* * * * *',
        } as never
        pikkuState(null, 'scheduler', 'tasks').set(entry, {
          name: entry,
          schedule: '* * * * *',
          func: { func },
        } as never)
        return
      case 'agent-tool':
        pikkuState(null, 'agent', 'agentsMeta')[entry] = {
          name: entry,
          tools: [entry],
        } as never
        pikkuState(null, 'agent', 'agents').set(entry, { name: entry } as never)
        pikkuState(null, 'rpc', 'meta')[entry] = entry
        return
      case 'trigger':
        pikkuState(null, 'rpc', 'meta')[entry] = entry
        return
    }
  }

  private gatewayConfig(entry: string, func: (...args: any[]) => any) {
    return {
      name: entry,
      type: 'listener' as const,
      adapter: {
        name: 'matrix',
        parse: (raw: any) => ({ senderId: 'sender', text: 'hi', raw }),
        send: async () => {},
      },
      func: { func, auth: false },
    }
  }

  private wireHop(instance: Instance, target: string) {
    const { index } = instance
    switch (this.combo.hop) {
      case 'mesh': {
        const route = `/mesh/rpc/${target}`
        const http = pikkuState(null, 'http', 'meta')
        http.post[route] = {
          pikkuFuncId: target,
          route,
          method: 'post',
        } as never
        wireHTTP({
          route,
          method: 'post',
          auth: false,
          middleware: [pikkuMeshAuthMiddleware],
          func: {
            func: pikkuState(null, 'function', 'functions').get(target)!.func,
            auth: false,
          },
        } as never)
        return
      }
      case 'remote-addon':
        pikkuState(null, 'addons', 'packages').set(`far-${index}`, {
          name: `far-${index}`,
          package: `@far/pkg-${index}`,
          remote: true,
          serverUrl: `https://far-${index}.test`,
          remoteTimeoutMs: 2,
          ...(this.outcome === 'auth-remote-addon'
            ? { remoteAuth: { resolve: () => '' } }
            : {}),
        } as never)
        return
      case 'enqueue':
        pikkuState(null, 'queue', 'meta')[`q-${index}`] = {
          pikkuFuncId: target,
        } as never
        pikkuState(null, 'queue', 'registrations').set(`q-${index}`, {
          name: `q-${index}`,
          func: {},
        } as never)
        return
      case 'start-workflow':
      case 'child-workflow':
        this.settlers.set(
          index,
          defineRun(
            this.h,
            {
              id: String(index),
              workflow: (this.combo.workflow ?? 'dsl-queued') as Workflow,
              step: (this.combo.step ?? 'rpc') as Step,
              outcome: this.outcome,
            },
            this.combo.hop === 'child-workflow'
          )
        )
        return
    }
  }

  private async hop(instance: Instance, services: any, wire: any) {
    const { index } = instance
    const target = `target-${index}`
    switch (this.combo.hop) {
      case 'rpc':
        return wire.rpc.invoke(target, {})
      case 'mesh':
        return wire.rpc.mesh(target, {})
      case 'remote-addon':
        return wire.rpc.invoke(`far-${index}:fn`, {})
      case 'enqueue':
        return services.queueService.add(
          `q-${index}`,
          { index },
          this.jobOptions
        )
      case 'schedule':
        return services.schedulerService.scheduleRPC(5, target, {})
      case 'start-workflow':
      case 'child-workflow': {
        const { runId } = await wire.rpc.startWorkflow(
          `flow-${index}`,
          {},
          {
            inline: this.combo.workflow?.endsWith('-inline'),
          }
        )
        instance.runId = runId
      }
    }
  }

  private get jobOptions(): JobOptions {
    return {
      ...(this.timing === 'delayed-job' ? { delay: 1 } : {}),
      ...(this.outcome === 'job-exhausted' || this.timing === 'retry-backoff'
        ? { attempts: 3, backoff: { type: 'fixed' as const, delay: 1 } }
        : {}),
    }
  }

  /** Runs the chain from its start, then every job and timer it left behind. */
  async run() {
    await Promise.all(this.instances.map((i) => this.startInstance(i)))
    await this.deliver()
    await Promise.all(this.instances.map((i) => this.settle(i)))
    await this.deliver()
    return this.instances
  }

  private async settle(instance: Instance) {
    const settler = this.settlers.get(instance.index)
    if (!instance.runId || !settler) return
    await settler.settle(instance.runId, async () => {
      for (const { data } of this.sleeps.splice(0)) {
        await this.h.ws.executeWorkflowSleepCompleted(data.runId, data.stepId)
      }
    })
  }

  private async startInstance(instance: Instance) {
    try {
      await this.drive(instance)
    } catch (e: any) {
      instance.failure = e
      instance.errorId ??= e?.error?.data?.errorId
      instance.callerRefused = true
    }
    instance.entryFinishedAt ??= performance.now()
  }

  private async drive(instance: Instance) {
    const { index } = instance
    const entry = `entry-${index}`
    switch (this.combo.start) {
      case 'http': {
        const response = await pikkuFetch(
          new Request(`http://matrix/entry-${index}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(instance.sent ? { traceparent: instance.sent } : {}),
              ...(this.meshGuardsEntry
                ? { authorization: 'Bearer forged' }
                : {}),
            },
            body: '{}',
          }),
          {
            trustInboundTraceparent:
              this.inbound !== 'forged' && !this.meshGuardsEntry,
          }
        )
        const body: any = await response.json().catch(() => undefined)
        instance.errorId = body?.errorId
        instance.callerRefused = !response.ok
        return
      }
      case 'channel': {
        const channel = await runLocalChannel({
          channelId: `channel-${index}`,
          route: `/channel-${index}`,
          request: {
            path: () => `/channel-${index}`,
            method: () => 'get',
            header: (name: string) =>
              name === 'traceparent' ? (instance.sent ?? null) : null,
            cookie: () => null,
            params: () => ({}),
            setParams: () => {},
            query: () => ({}),
            data: async () => ({}),
            json: async () => ({}),
          } as never,
          response: {
            status() {
              return this
            },
            header() {
              return this
            },
            json() {},
            cookie() {
              return this
            },
          } as never,
        })
        if (!channel) throw new Error('the channel did not open')
        const sent: any[] = []
        channel.registerOnSend((message: unknown) => {
          sent.push(message)
        })
        await channel.open()
        await channel.message(JSON.stringify({ action: 'go' }))
        const failed = sent.find((message) => message?.error)
        if (failed) {
          instance.failure = failed
          instance.errorId = failed.errorId
          instance.callerRefused = true
        }
        return
      }
      case 'mcp':
        await runMCPTool(
          { jsonrpc: '2.0', id: 1, params: {} } as never,
          {
            mcp: {
              sendResourceUpdated: () => {},
              enableResources: async () => true,
              enablePrompts: async () => true,
              enableTools: async () => true,
            },
            ...(instance.sent
              ? {
                  http: {
                    request: {
                      header: (name: string) =>
                        name === 'traceparent' ? instance.sent : null,
                    },
                  },
                }
              : {}),
          } as never,
          entry
        )
        return
      case 'cli':
        await runCLICommand({
          program: entry,
          commandPath: ['go'],
          data: {},
          singletonServices: this.singletons,
          onOutput: () => {},
        })
        return
      case 'gateway': {
        const config = this.gatewayConfig(
          entry,
          pikkuState(null, 'function', 'functions').get(entry)!.func
        )
        await createListenerMessageHandler(
          entry,
          config as never,
          this.singletons
        )({})
        return
      }
      case 'queue-job':
        this.pending.push({
          index,
          queueName: `job-${index}`,
          encoded: this.transport.encode(
            {},
            { traceparent: instance.sent, ...this.startJobOptions }
          ),
          options: this.startJobOptions,
          id: `start-${index}`,
        })
        return
      case 'schedule':
        await runScheduledTask({ name: entry, traceparent: instance.sent })
        return
      case 'agent-tool': {
        const { tools } = await buildToolDefs(
          instance.caller ? { trace: instance.caller } : {},
          new Map<string, string>(),
          'resource-1',
          entry,
          null,
          undefined,
          []
        )
        await tools[0]!.execute({})
        return
      }
      case 'trigger':
        await new MatrixTriggers().fire(entry)
        return
    }
  }

  private get startJobOptions(): JobOptions {
    return this.jobOptions
  }

  private get singletons() {
    return pikkuState(
      null,
      'package',
      'singletonServices'
    ) as never as CoreSingletonServices
  }

  /** Delivers jobs and scheduled calls the way the adapter would. */
  private async deliver() {
    for (const { index, rpc, traceparent } of this.scheduled.splice(0)) {
      await this.fire(index, rpc, traceparent)
    }
    const batches = this.pending.splice(0)
    await Promise.all(batches.map((job) => this.deliverJob(job)))
    await this.h.pump()
    if (this.pending.length > 0) await this.deliver()
  }

  private async deliverJob(job: (typeof this.pending)[number]) {
    const instance = this.instances[job.index]!
    const { data, traceparent } = this.transport.decode(job.encoded)
    instance.job = job.encoded
    if (traceparent && job.queueName.startsWith('q-')) {
      instance.outgoing.push(traceparent)
    }
    const attempt = () =>
      runQueueJob({
        job: {
          id: job.id,
          queueName: job.queueName,
          data,
          status: () => 'active',
          metadata: () => ({
            attemptsMade: 0,
            maxAttempts: 1,
            createdAt: new Date(),
          }),
          traceparent,
        } as QueueJob,
      })
    const attempts = job.options?.attempts ?? 1
    if (job.options?.delay) await delay(job.options.delay)
    for (let n = 0; n < attempts; n++) {
      try {
        await this.deliveredOnce(attempt)
        return
      } catch (e) {
        instance.failure ??= e
        if (e instanceof QueueJobDiscardedError) return
      }
    }
  }

  private async deliveredOnce(attempt: () => Promise<unknown>) {
    if (this.timing === 'duplicate-delivery') {
      await attempt().catch(() => {})
      await attempt()
    } else if (this.timing === 'lease-expiry-redelivery') {
      // The lease ran out while the first delivery was still working.
      const [first] = await Promise.allSettled([attempt(), attempt()])
      if (first.status === 'rejected') throw first.reason
    } else {
      await attempt()
    }
  }

  /** What a scheduler's worker does with a one-off `scheduleRPC`. */
  private async fire(index: number, rpc: string, traceparent?: string) {
    const instance = this.instances[index]!
    if (traceparent) instance.outgoing.push(traceparent)
    const services = this.singletons
    const wire = traceWire(traceparent)
    instance.relays.push(wire.trace)
    await rpcService
      .getContextRPCService(services, wire as never, false)
      .invoke(rpc, {})
      .catch((e: unknown) => {
        tracedLogger(services.logger, wire.traceId).error(e as Error)
        instance.failure ??= e
      })
  }
}

class MatrixTriggers extends PikkuTriggerService {
  async start() {}
  fire(name: string) {
    return this.onTriggerFire(
      name,
      [{ targetType: 'rpc', targetName: name }],
      {}
    )
  }
}
