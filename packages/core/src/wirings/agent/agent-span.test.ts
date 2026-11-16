import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { runAgent, resumeAgentSync } from './agent-runner.js'
import { resumeAgent, streamAgent } from './agent-stream.js'
import { RecordingTracer } from '../../testing/recording-tracer.js'
import { AttributeTypes } from '../../otlp/attribute-types.js'
import { createTrace } from '../../trace.js'
import { disableTracer } from '../../boundary-span.js'
import type { FinishedSpan } from '../../tracer.js'
import type {
  AgentRunnerParams,
  AgentStepResult,
} from '../../services/agent-runner-service.js'
import type {
  AgentRunState,
  AgentStreamEvent,
  CoreAgent,
} from './agent.types.js'
import { AgentInterruptedError } from './agent-interrupt.js'

const PROMPT = 'SENTINEL-PROMPT-7f3a'
const TOOL_ARGS = 'SENTINEL-ARGS-91bc'
const TOOL_RESULT = 'SENTINEL-RESULT-c04d'
const REPLY = 'SENTINEL-REPLY-5e1a'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

beforeEach(() => {
  resetPikkuState()
})

const addAgent = (name: string, extra: Partial<CoreAgent> = {}, meta = {}) => {
  const agent: CoreAgent = {
    auth: false,
    name,
    description: 'test agent',
    instructions: 'be helpful',
    model: 'openai/gpt-test',
    ...extra,
  }
  pikkuState(null, 'agent', 'agentsMeta')[name] = {
    ...agent,
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
    ...meta,
  }
  pikkuState(null, 'agent', 'agents').set(name, agent)
}

const addTool = (name: string, func?: () => Promise<unknown>) => {
  pikkuState(null, 'rpc', 'meta')[name] = name
  pikkuState(null, 'function', 'meta')[name] = {
    description: name,
    inputSchemaName: 'ToolInput',
    sessionless: true,
  } as any
  pikkuState(null, 'misc', 'schemas').set('ToolInput', {
    type: 'object',
    properties: { q: { type: 'string' } },
  })
  pikkuState(null, 'function', 'functions').set(name, {
    func: func ?? (async () => TOOL_RESULT),
  } as any)
}

const step = (overrides: Partial<AgentStepResult> = {}): AgentStepResult => ({
  text: REPLY,
  toolCalls: [],
  toolResults: [],
  usage: { inputTokens: 11, outputTokens: 7 },
  finishReason: 'stop',
  ...overrides,
})

const install = (services: Record<string, unknown>) => {
  const tracer = new RecordingTracer()
  pikkuState(null, 'package', 'singletonServices', {
    logger,
    tracer,
    agentRunState: {
      createRun: async () => 'run-1',
      updateRun: async () => {},
    },
    ...services,
  } as any)
  return tracer
}

const named = (tracer: RecordingTracer, name: string): FinishedSpan[] =>
  tracer.spans.filter((s) => s.name === name)

const only = (tracer: RecordingTracer, name: string): FinishedSpan => {
  const found = named(tracer, name)
  assert.equal(found.length, 1, `exactly one '${name}' span`)
  return found[0]!
}

const dump = (value: unknown) =>
  JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))

const channel = (events: AgentStreamEvent[] = []) =>
  ({
    channelId: 'c',
    openingData: undefined,
    state: 'open',
    send: (event: AgentStreamEvent) => {
      events.push(event)
    },
    close: () => {},
  }) as any

const input = {
  message: PROMPT,
  threadId: 'thread',
  resourceId: 'resource',
}

describe('an agent run is a span', () => {
  test('a sync run is one span with its tool calls and model calls as children', async () => {
    addAgent('helper', {}, { tools: ['lookup'] })
    addTool('lookup')
    let calls = 0
    const tracer = install({
      agentRunner: {
        run: async (params: AgentRunnerParams) => {
          if (calls++ === 0) {
            await params.tools[0]!.execute({ q: TOOL_ARGS }, {} as any)
            return step({
              toolCalls: [
                {
                  toolCallId: 'c1',
                  toolName: 'lookup',
                  args: { q: TOOL_ARGS },
                },
              ],
              finishReason: 'tool-calls',
              cost: 0.0042,
            })
          }
          return step()
        },
      },
    })
    const caller = createTrace()

    await runAgent('helper', input, { trace: caller })

    const run = only(tracer, 'helper')
    assert.equal(run.parentSpanId, caller.spanId)
    assert.equal(run.traceId, caller.traceId)
    assert.equal(run.kind, 'internal')
    assert.equal(run.status.code, 'ok')
    assert.equal(run.attributes['pikku.wire.type'], 'agent')
    assert.equal(run.attributes['pikku.agent.name'], 'helper')
    assert.equal(run.attributes['pikku.agent.run_id'], 'run-1')

    const tool = only(tracer, 'lookup')
    assert.equal(tool.parentSpanId, run.spanId)
    assert.equal(tool.traceId, run.traceId)

    const models = named(tracer, 'chat')
    assert.equal(models.length, 2, 'one span per model call')
    for (const model of models) {
      assert.equal(model.parentSpanId, run.spanId)
      assert.equal(model.kind, 'client')
      assert.equal(model.attributes['gen_ai.request.model'], 'openai/gpt-test')
      assert.equal(model.attributes['gen_ai.provider.name'], 'openai')
      assert.equal(model.attributes['gen_ai.usage.input_tokens'], 11)
      assert.equal(model.attributes['gen_ai.usage.output_tokens'], 7)
    }
    assert.equal(
      models[0]!.attributes['gen_ai.response.finish_reasons'],
      'tool-calls'
    )
    assert.equal(models[0]!.attributes['pikku.ai.cost_usd'], 0.0042)
    assert.equal(
      models[1]!.attributes['gen_ai.response.finish_reasons'],
      'stop'
    )
    assert.equal(
      'pikku.ai.cost_usd' in models[1]!.attributes,
      false,
      'no cost is invented when the runner did not read one'
    )
    assert.equal(tracer.spans.length, 4)
  })

  test('a run with no caller trace is the root of one', async () => {
    addAgent('rooted')
    const tracer = install({
      agentRunner: { run: async () => step() },
    })

    await runAgent('rooted', input, {})

    const run = only(tracer, 'rooted')
    assert.equal(run.parentSpanId, undefined)
    assert.equal(run.attributes['pikku.trace.root'], true)
    assert.equal(only(tracer, 'chat').traceId, run.traceId)
  })

  test('no content reaches a span, and every key is on the allow-list', async () => {
    addAgent('quiet', {}, { tools: ['lookup'] })
    addTool('lookup')
    let calls = 0
    const tracer = install({
      agentRunner: {
        run: async (params: AgentRunnerParams) => {
          if (calls++ === 0) {
            await params.tools[0]!.execute({ q: TOOL_ARGS }, {} as any)
            return step({
              toolCalls: [
                {
                  toolCallId: 'c1',
                  toolName: 'lookup',
                  args: { q: TOOL_ARGS },
                },
              ],
              toolResults: [
                { toolCallId: 'c1', toolName: 'lookup', result: TOOL_RESULT },
              ],
              finishReason: 'tool-calls',
            })
          }
          return step()
        },
      },
    })

    await runAgent('quiet', input, { trace: createTrace() })

    const everything = dump(tracer.spans)
    for (const sentinel of [PROMPT, TOOL_ARGS, TOOL_RESULT, REPLY]) {
      assert.equal(everything.includes(sentinel), false, `${sentinel} leaked`)
    }
    const types = new AttributeTypes()
    for (const span of tracer.spans) types.coerce(span.attributes)
    assert.equal(types.dropped, 0, 'the exporter drops none of the keys set')
  })

  test('a model name that is not an identifier is not recorded', async () => {
    addAgent('odd', { model: 'openai/has space and ' + PROMPT })
    const tracer = install({
      agentRunner: { run: async () => step() },
    })

    await runAgent('odd', input, { trace: createTrace() })

    const model = only(tracer, 'chat')
    assert.equal('gen_ai.request.model' in model.attributes, false)
    assert.equal(dump(model).includes(PROMPT), false)
  })

  test('a failing model call closes both spans and keeps only the error class on the model call', async () => {
    addAgent('failing')
    const tracer = install({
      agentRunner: {
        run: async () => {
          throw new TypeError('https://user:hunter2@llm.internal rejected')
        },
      },
    })

    await assert.rejects(() =>
      runAgent('failing', input, { trace: createTrace() })
    )

    const run = only(tracer, 'failing')
    const model = only(tracer, 'chat')
    assert.equal(run.status.code, 'error')
    assert.equal(model.status.code, 'error')
    assert.equal(model.parentSpanId, run.spanId)
    const event = model.events?.[0]
    assert.equal(event?.name, 'exception')
    assert.deepEqual(event?.attributes, { 'exception.type': 'TypeError' })
    assert.equal(dump(tracer.spans).includes('hunter2'), false)
    assert.equal(run.events?.[0]?.attributes?.['exception.type'], 'TypeError')
  })

  test('an error thrown before the run starts still closes the span', async () => {
    addAgent('no-runner')
    const tracer = install({})

    await assert.rejects(() =>
      runAgent('no-runner', input, { trace: createTrace() })
    )

    assert.equal(only(tracer, 'no-runner').status.code, 'error')
  })

  test('an interrupt ends the run ok and the model call it cut short in error', async () => {
    addAgent('interrupted')
    const tracer = install({
      agentRunner: {
        run: async () => {
          throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        },
      },
    })

    await assert.rejects(
      () => runAgent('interrupted', input, { trace: createTrace() }),
      (error: unknown) => error instanceof AgentInterruptedError
    )

    assert.equal(only(tracer, 'interrupted').status.code, 'ok')
    assert.equal(only(tracer, 'chat').status.code, 'error')
    assert.equal(tracer.spans.length, 2, 'both spans closed')
  })

  test('a suspended run (approval needed) closes ok', async () => {
    addAgent('approver', {}, { tools: ['lookup'] })
    addTool('lookup')
    pikkuState(null, 'function', 'meta').lookup = {
      ...(pikkuState(null, 'function', 'meta').lookup as any),
      approvalRequired: true,
    }
    const tracer = install({
      agentRunner: {
        run: async (params: AgentRunnerParams) => {
          params.tools[0]!.needsApproval = true
          return step({
            toolCalls: [
              { toolCallId: 'c1', toolName: 'lookup', args: { q: 'x' } },
            ],
            finishReason: 'tool-calls',
          })
        },
      },
    })

    const result = await runAgent('approver', input, { trace: createTrace() })

    assert.equal(result.status, 'suspended')
    assert.equal(only(tracer, 'approver').status.code, 'ok')
  })

  test('a sub-agent run is a child of the run that called it', async () => {
    addAgent('parent', {}, { agents: ['child'] })
    addAgent('child')
    let parentCalls = 0
    const tracer = install({
      agentRunner: {
        run: async (params: AgentRunnerParams) => {
          if (params.agentId === 'parent') {
            if (parentCalls++ === 0) {
              const tool = params.tools.find((t) => t.name === 'child')!
              await tool.execute({ message: 'delegate' }, {} as any)
              return step({
                toolCalls: [{ toolCallId: 'c1', toolName: 'child', args: {} }],
                finishReason: 'tool-calls',
              })
            }
          }
          return step()
        },
      },
    })

    await runAgent('parent', input, { trace: createTrace() })

    const parent = only(tracer, 'parent')
    const child = only(tracer, 'child')
    assert.equal(child.parentSpanId, parent.spanId)
    assert.equal(child.traceId, parent.traceId)
    assert.equal(child.attributes['pikku.agent.name'], 'child')
    const childModel = tracer.spans.find(
      (s) => s.name === 'chat' && s.parentSpanId === child.spanId
    )
    assert.ok(
      childModel,
      'the sub-agent model call hangs off the sub-agent run'
    )
    assert.equal(
      named(tracer, 'chat').filter((s) => s.parentSpanId === parent.spanId)
        .length,
      2
    )
  })

  test('a tracer that is not listening records nothing and the run is unchanged', async () => {
    addAgent('silent')
    const tracer = install({ agentRunner: { run: async () => step() } })
    const services = pikkuState(null, 'package', 'singletonServices') as any
    services.tracer = {
      ...tracer,
      active: false,
      startSpan: tracer.startSpan.bind(tracer),
    }

    const result = await runAgent('silent', input, { trace: createTrace() })

    assert.equal(result.text, REPLY)
    assert.equal(tracer.spans.length, 0)
  })

  test('a tracer that throws is disabled and the run still succeeds', async () => {
    addAgent('hostile')
    const tracer = install({ agentRunner: { run: async () => step() } })
    const services = pikkuState(null, 'package', 'singletonServices') as any
    const broken = {
      startSpan: () => {
        throw new Error('tracer down')
      },
    }
    services.tracer = broken
    disableTracer(broken as any, logger as any, new Error('x'))

    const result = await runAgent('hostile', input, { trace: createTrace() })

    assert.equal(result.text, REPLY)
    assert.equal(tracer.spans.length, 0)
  })

  test('the caller params are left as they were', async () => {
    addAgent('pure')
    install({ agentRunner: { run: async () => step() } })
    const caller = createTrace()
    const params = { trace: caller }

    await runAgent('pure', input, params)

    assert.equal(params.trace, caller)
  })
})

describe('a streamed agent run is a span', () => {
  test('carries tokens on the model call and tools under the run', async () => {
    addAgent('streamer', {}, { tools: ['lookup'] })
    addTool('lookup')
    let calls = 0
    const tracer = install({
      agentRunner: {
        stream: async (params: AgentRunnerParams) => {
          if (calls++ === 0) {
            await params.tools[0]!.execute({ q: TOOL_ARGS }, {} as any)
            return step({
              toolCalls: [
                {
                  toolCallId: 'c1',
                  toolName: 'lookup',
                  args: { q: TOOL_ARGS },
                },
              ],
              finishReason: 'tool-calls',
            })
          }
          return step({ usage: { inputTokens: 5, outputTokens: 3 } })
        },
      },
    })
    const caller = createTrace()

    await streamAgent('streamer', input, channel(), { trace: caller })

    const run = only(tracer, 'streamer')
    assert.equal(run.parentSpanId, caller.spanId)
    assert.equal(run.status.code, 'ok')
    assert.equal(run.attributes['pikku.agent.run_id'], 'run-1')
    assert.equal(only(tracer, 'lookup').parentSpanId, run.spanId)
    const models = named(tracer, 'chat')
    assert.equal(models.length, 2)
    assert.equal(models[1]!.attributes['gen_ai.usage.input_tokens'], 5)
    assert.equal(models[1]!.attributes['gen_ai.usage.output_tokens'], 3)
    assert.equal(models[1]!.parentSpanId, run.spanId)
  })

  test('a stream that fails is an error even though the stream returns', async () => {
    addAgent('stream-fails')
    const events: AgentStreamEvent[] = []
    const tracer = install({
      agentRunner: {
        stream: async () => {
          throw new Error('https://user:hunter2@llm.internal rejected')
        },
      },
    })

    await streamAgent('stream-fails', input, channel(events), {
      trace: createTrace(),
    })

    assert.ok(events.some((e) => e.type === 'error'))
    assert.equal(only(tracer, 'stream-fails').status.code, 'error')
    assert.equal(dump(tracer.spans).includes('hunter2'), false)
    assert.equal(only(tracer, 'chat').status.code, 'error')
  })

  test('an interrupted stream ends the run ok', async () => {
    addAgent('stream-interrupted')
    const tracer = install({
      agentRunner: {
        stream: async () => {
          throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        },
      },
    })

    await streamAgent('stream-interrupted', input, channel(), {
      trace: createTrace(),
    })

    assert.equal(only(tracer, 'stream-interrupted').status.code, 'ok')
    assert.equal(tracer.spans.length, 2)
  })

  test('a sub-agent stream is a child of the streaming run', async () => {
    addAgent('stream-parent', {}, { agents: ['stream-child'] })
    addAgent('stream-child')
    let calls = 0
    const tracer = install({
      agentRunner: {
        stream: async (params: AgentRunnerParams) => {
          if (params.agentId === 'stream-parent' && calls++ === 0) {
            const tool = params.tools.find((t) => t.name === 'stream-child')!
            await tool.execute({ message: 'go' }, {} as any)
            return step({
              toolCalls: [
                { toolCallId: 'c1', toolName: 'stream-child', args: {} },
              ],
              finishReason: 'tool-calls',
            })
          }
          return step()
        },
      },
    })

    await streamAgent('stream-parent', input, channel(), {
      trace: createTrace(),
    })

    const parent = only(tracer, 'stream-parent')
    assert.equal(only(tracer, 'stream-child').parentSpanId, parent.spanId)
  })
})

describe('a resumed agent run is a span', () => {
  const suspended = (agentName: string): AgentRunState => ({
    runId: 'run-9',
    agentName,
    threadId: 'thread-9',
    resourceId: 'resource-9',
    status: 'suspended',
    suspendReason: 'approval',
    pendingApprovals: [
      {
        type: 'tool-call',
        toolCallId: 'tc-1',
        toolName: 'lookup',
        args: { q: 'x' },
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ],
    usage: { inputTokens: 0, outputTokens: 0, model: 'openai/gpt-test' },
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  const resumeServices = (run: AgentRunState) => ({
    agentRunState: {
      getRun: async () => run,
      resolveApproval: async () => {
        run.pendingApprovals = []
        return true
      },
      updateRun: async () => {},
    },
    agentStorage: {
      saveMessages: async () => {},
      getMessages: async () => [],
    },
  })
  const owner = {
    sessionService: { get: () => ({ userId: 'resource-9' }) } as never,
  }

  test('approve (sync) names the run and parents the tool and model call', async () => {
    addAgent('resumable', {}, { tools: ['lookup'] })
    addTool('lookup')
    const tracer = install({
      ...resumeServices(suspended('resumable')),
      agentRunner: { run: async () => step() },
    })
    const caller = createTrace()

    await resumeAgentSync('run-9', [{ toolCallId: 'tc-1', approved: true }], {
      ...owner,
      trace: caller,
    })

    const run = only(tracer, 'resumable')
    assert.equal(run.parentSpanId, caller.spanId)
    assert.equal(run.attributes['pikku.agent.run_id'], 'run-9')
    assert.equal(only(tracer, 'lookup').parentSpanId, run.spanId)
    assert.equal(only(tracer, 'chat').parentSpanId, run.spanId)
  })

  test('resume (stream) names the run and parents the tool and model call', async () => {
    addAgent('resumable-stream', {}, { tools: ['lookup'] })
    addTool('lookup')
    const tracer = install({
      ...resumeServices(suspended('resumable-stream')),
      agentRunner: { stream: async () => step() },
    })

    await resumeAgent(
      { runId: 'run-9', toolCallId: 'tc-1', approved: true },
      channel(),
      { ...owner, trace: createTrace() }
    )

    const run = only(tracer, 'resumable-stream')
    assert.equal(run.attributes['pikku.agent.run_id'], 'run-9')
    assert.equal(only(tracer, 'lookup').parentSpanId, run.spanId)
    assert.equal(only(tracer, 'chat').parentSpanId, run.spanId)
    assert.equal(run.status.code, 'ok')
  })

  test('a run that cannot be found fails without a span', async () => {
    addAgent('gone')
    const tracer = install({
      agentRunState: { getRun: async () => undefined },
      agentRunner: { run: async () => step() },
    })

    await assert.rejects(() =>
      resumeAgentSync('nope', [], { trace: createTrace() })
    )

    assert.equal(tracer.spans.length, 0)
  })
})
