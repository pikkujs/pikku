import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { addFunction } from '../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../pikku-state.js'
import { createTrace } from '../trace.js'
import { buildToolDefs } from './agent/agent-prepare.js'
import { wireChannel } from './channel/channel-runner.js'
import { runLocalChannel } from './channel/local/local-channel-runner.js'
import { MCPError, runMCPTool } from './mcp/mcp-runner.js'
import { unwrapJobTrace, wrapJobTrace } from './queue/queue-trace.js'
import { ContextAwareRPCService } from './rpc/rpc-runner.js'
import { PikkuTriggerService } from './trigger/pikku-trigger-service.js'
import { InMemoryWorkflowService } from './workflow/in-memory-workflow-service.js'
import { addWorkflow } from './workflow/dsl/workflow-runner.js'

type Log = { scope?: string; message: unknown }

const recording = (errors: Log[], scope?: string): any => ({
  info() {},
  warn() {},
  debug() {},
  error: (message: unknown) => errors.push({ scope, message }),
  scope: (traceId: string) => recording(errors, traceId),
})

const define = (name: string, func: (...args: any[]) => unknown) => {
  pikkuState(null, 'rpc', 'meta')[name] = name
  pikkuState(null, 'function', 'meta')[name] = {
    pikkuFuncId: name,
    name,
    sessionless: true,
    inputSchemaName: null,
    outputSchemaName: null,
  } as never
  addFunction(name, { func: async (...args: any[]) => func(...args) } as never)
}

const boom = () => {
  throw new Error('boom')
}

describe('a failure keeps its trace', () => {
  let errors: Log[]
  let singletons: any

  beforeEach(() => {
    resetPikkuState()
    errors = []
    singletons = { logger: recording(errors), config: {} }
    pikkuState(null, 'package', 'singletonServices', singletons)
  })

  const assertOnly = (traceId: string) => {
    assert.ok(errors.length > 0, 'nothing was logged')
    for (const { scope, message } of errors) {
      assert.equal(scope, traceId, `off the trace: ${message}`)
    }
  }

  test('an MCP tool: the log and the error sent back', async () => {
    define('tool', boom)
    pikkuState(null, 'mcp', 'toolsMeta').tool = { pikkuFuncId: 'tool' } as never
    const failure = await runMCPTool(
      { jsonrpc: '2.0', id: 1, params: {} } as never,
      { mcp: { sendResourceUpdated() {} } } as never,
      'tool'
    ).catch((e) => e)
    assert.ok(failure instanceof MCPError)
    const errorId = (failure.error.data as any).errorId
    assert.match(errorId, /^[0-9a-f]{32}$/)
    assertOnly(errorId)
  })

  test('a channel message: the log and the frame sent back', async () => {
    define('hop', boom)
    pikkuState(null, 'channel', 'meta').room = {
      name: 'room',
      route: '/room',
      messageWirings: { action: { go: { pikkuFuncId: 'hop' } } },
    } as never
    wireChannel({
      name: 'room',
      route: '/room',
      onMessageWiring: {
        action: { go: { func: { func: boom, auth: false }, auth: false } },
      },
    } as never)
    const channel = await runLocalChannel({
      channelId: 'c1',
      route: '/room',
      request: {
        path: () => '/room',
        method: () => 'get',
        header: () => null,
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
    } as never)
    const sent: any[] = []
    channel!.registerOnSend((message: unknown) => {
      sent.push(message)
    })
    await channel!.open()
    await channel!.message(JSON.stringify({ action: 'go' }))
    const { errorId } = sent.find((message) => message?.error)
    assert.match(errorId, /^[0-9a-f]{32}$/)
    assertOnly(errorId)
  })

  test('a trigger', async () => {
    define('fired', boom)
    class Triggers extends PikkuTriggerService {
      async start() {}
      fire = () =>
        this.onTriggerFire(
          'fired',
          [{ targetType: 'rpc', targetName: 'fired' }],
          {}
        )
    }
    await new Triggers().fire()
    assert.equal(errors.length > 0, true)
    assert.notEqual(errors[0]!.scope, undefined)
    assertOnly(errors[0]!.scope!)
  })

  test('an agent tool', async () => {
    define('tool', boom)
    pikkuState(null, 'agent', 'agentsMeta').agent = {
      name: 'agent',
      tools: ['tool'],
    } as never
    pikkuState(null, 'agent', 'agents').set('agent', {
      name: 'agent',
    } as never)
    const caller = createTrace()
    const { tools } = await buildToolDefs(
      { trace: caller },
      new Map<string, string>(),
      'resource-1',
      'agent',
      null,
      undefined,
      []
    )
    await assert.rejects(tools[0]!.execute({}) as Promise<unknown>)
    assertOnly(caller.traceId)
  })

  test('an inline workflow', async () => {
    const service = new InMemoryWorkflowService()
    singletons.workflowService = service
    pikkuState(null, 'workflows', 'meta').flow = {
      name: 'flow',
      pikkuFuncId: 'flow',
      source: 'dsl',
      graphHash: 'hash',
    } as never
    pikkuState(null, 'function', 'meta').flow = {
      name: 'flow',
      sessionless: true,
      permissions: [],
    } as never
    addWorkflow('flow', { func: async () => boom() } as never)
    const caller = createTrace()
    await assert.rejects(
      service.startWorkflow(
        'flow',
        {},
        {
          type: 'test',
          traceparent: `00-${caller.traceId}-${caller.spanId}-01`,
        } as never,
        {} as never,
        { inline: true }
      )
    )
    assertOnly(caller.traceId)
  })

  test('a remote addon that cannot be reached', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new TypeError('connection refused')
    }) as never
    try {
      pikkuState(null, 'addons', 'packages').set('far', {
        package: 'far',
        remote: true,
        serverUrl: 'http://far.test',
        expose: true,
      } as never)
      const caller = createTrace()
      const rpc = new ContextAwareRPCService(
        singletons,
        { traceId: caller.traceId, trace: caller } as never,
        {}
      )
      await assert.rejects(rpc.rpc('far:fn', {}))
      assertOnly(caller.traceId)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('a local RPC', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', {
      logger: recording([]),
      config: {},
    } as never)
  })

  test('runs as a span of its own under the caller', async () => {
    const seen: any[] = []
    define('callee', (_services, _data, { trace }) => seen.push(trace))
    const caller = createTrace()
    const rpc = new ContextAwareRPCService(
      pikkuState(null, 'package', 'singletonServices') as never,
      { traceId: caller.traceId, trace: caller } as never,
      {}
    )
    await rpc.rpc('callee', {})
    await rpc.rpc('callee', {})
    assert.equal(seen.length, 2)
    for (const trace of seen) {
      assert.equal(trace.traceId, caller.traceId)
      assert.equal(trace.parentSpanId, caller.spanId)
      assert.notEqual(trace.spanId, caller.spanId)
    }
    assert.notEqual(seen[0].spanId, seen[1].spanId)
  })
})

describe('a job whose data looks like the trace envelope', () => {
  const shaped = { __pikkuTraceparent: 'mine', data: 1 }

  test('reaches the worker unchanged with no trace', () => {
    assert.deepEqual(unwrapJobTrace(wrapJobTrace(shaped)), { data: shaped })
  })

  test('reaches the worker unchanged with a trace', () => {
    const traceparent = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`
    assert.deepEqual(unwrapJobTrace(wrapJobTrace(shaped, traceparent)), {
      data: shaped,
      traceparent,
    })
  })
})
