import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { addFunction, runPikkuFunc } from '../function/function-runner.js'
import { RecordingTracer } from '../testing/recording-tracer.js'
import {
  traceSchedulerService,
  traceWebhookService,
} from '../function/trace-queue-service.js'
import { pikkuState, resetPikkuState } from '../pikku-state.js'
import { IncomingWebhookService } from '../services/incoming-webhook-service.js'
import { QueueWebhookService } from '../services/queue-webhook-service.js'
import { createTrace, formatTraceparent, isValidTraceId } from '../trace.js'
import { buildToolDefs } from './agent/agent-prepare.js'
import { scoreFinishedRun } from './agent-scorer/agent-scorer-live.js'
import { pikkuAgentScorer } from './agent-scorer/agent-scorer.js'
import { createChannelRPCResponder } from './channel/channel-rpc-responder.js'
import { CHANNEL_RPC_REQUEST } from './channel/channel-rpc.types.js'
import { PikkuLocalChannelHandler } from './channel/local/local-channel-handler.js'
import { dispatchWebhookSourceJob } from './trigger/webhook-source-runner.js'

const CALLER = createTrace()
const CALLER_TRACEPARENT = formatTraceparent(CALLER)
const OTHER_TRACEPARENT = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`

const logger = { info() {}, warn() {}, error() {}, debug() {} }

const recordingQueue = () => {
  const added: Array<{ name: string; data: any; options?: any }> = []
  return {
    added,
    queue: {
      supportsResults: false,
      add: async (name: string, data: any, options?: any) => {
        added.push({ name, data, options })
        return 'job-1'
      },
      getJob: async () => null,
    } as any,
  }
}

beforeEach(() => {
  resetPikkuState()
})

describe('a wire no runner gave a trace', () => {
  const run = async (wire: any) => {
    let seen: any
    addFunction('see', {
      func: async (_services: any, _data: any, { trace, traceId }: any) => {
        seen = { trace, traceId }
      },
    } as any)
    pikkuState(null, 'function', 'meta').see = {
      pikkuFuncId: 'see',
      sessionless: true,
    } as any
    await runPikkuFunc('cli', 'see', 'see', {
      singletonServices: { logger } as any,
      data: () => ({}),
      auth: false,
      wire,
    })
    return seen
  }

  test('becomes the root of a new trace', async () => {
    const { trace, traceId } = await run({})
    assert.ok(isValidTraceId(traceId))
    assert.equal(trace.traceId, traceId)
    assert.equal(trace.parentSpanId, undefined)
  })

  test('a wire that has one keeps it', async () => {
    const { trace } = await run({ traceId: CALLER.traceId, trace: CALLER })
    assert.equal(trace, CALLER)
  })
})

describe('services a function holds', () => {
  const wire = { trace: CALLER }

  test('scheduleRPC is stamped, and an explicit traceparent wins', async () => {
    const calls: unknown[][] = []
    const scheduler = traceSchedulerService(
      {
        scheduleRPC: async (...args: unknown[]) => {
          calls.push(args)
          return 'task-1'
        },
      } as any,
      wire
    )
    await scheduler.scheduleRPC(10, 'later', { a: 1 })
    await scheduler.scheduleRPC(10, 'later', {}, undefined, OTHER_TRACEPARENT)
    assert.equal(calls[0]![4], CALLER_TRACEPARENT)
    assert.equal(calls[1]![4], OTHER_TRACEPARENT)
  })

  test('scheduleRPC and webhook send are producer spans without payload or url', async () => {
    const tracer = new RecordingTracer()
    const tracing = { tracer, logger }
    const calls: unknown[][] = []
    const scheduler = traceSchedulerService(
      {
        scheduleRPC: async (...args: unknown[]) => {
          calls.push(args)
          return 'task-1'
        },
      } as any,
      wire,
      tracing
    )
    await scheduler.scheduleRPC(10, 'later', { secret: 'payload' })
    const sent: any[] = []
    const webhooks = traceWebhookService(
      { send: async (input: any) => (sent.push(input), { jobId: 'j' }) } as any,
      wire,
      tracing
    )
    await webhooks.send({
      url: 'https://example.com/hook?token=abc',
      event: 'order.paid',
      data: { secret: 'payload' },
    })
    const [schedule, send] = tracer.spans
    assert.equal(schedule!.name, 'scheduler.schedule')
    assert.equal(schedule!.kind, 'producer')
    assert.equal(schedule!.attributes['messaging.destination.name'], 'later')
    assert.equal(calls[0]![4], `00-${schedule!.traceId}-${schedule!.spanId}-01`)
    assert.equal(send!.name, 'webhook.send')
    assert.equal(send!.attributes['messaging.system'], 'pikku')
    assert.equal(sent[0].traceparent, `00-${send!.traceId}-${send!.spanId}-01`)
    for (const span of tracer.spans) {
      assert.equal(span.parentSpanId, CALLER.spanId)
      const text = JSON.stringify(span, (_, v) =>
        typeof v === 'bigint' ? String(v) : v
      )
      assert.ok(!text.includes('payload') && !text.includes('token=abc'))
    }
  })

  test('a webhook send records its event name and nothing from the url', async () => {
    const tracer = new RecordingTracer()
    const webhooks = traceWebhookService(
      { send: async () => ({ jobId: 'j' }) } as any,
      wire,
      { tracer, logger }
    )
    await webhooks.send({
      url: 'https://user:pw@example.com/hook?token=abc',
      event: 'order.paid',
    })
    assert.deepEqual(tracer.spans[0]!.attributes, {
      'messaging.system': 'pikku',
      'messaging.destination.name': 'order.paid',
    })
  })

  test('a traceparent the caller set wins over the producer span for scheduleRPC and send', async () => {
    const tracer = new RecordingTracer()
    const tracing = { tracer, logger }
    const calls: unknown[][] = []
    const sent: any[] = []
    await traceSchedulerService(
      {
        scheduleRPC: async (...args: unknown[]) => (calls.push(args), 't'),
      } as any,
      wire,
      tracing
    ).scheduleRPC(10, 'later', {}, undefined, OTHER_TRACEPARENT)
    await traceWebhookService(
      { send: async (input: any) => (sent.push(input), { jobId: 'j' }) } as any,
      wire,
      tracing
    ).send({
      url: 'https://example.com/hook',
      event: 'e',
      traceparent: OTHER_TRACEPARENT,
    })
    assert.equal(calls[0]![4], OTHER_TRACEPARENT)
    assert.equal(sent[0].traceparent, OTHER_TRACEPARENT)
  })

  for (const [what, tracer] of [
    [
      'startSpan',
      {
        startSpan: () => {
          throw new Error('tracer bug')
        },
      },
    ],
    [
      'span.end',
      {
        startSpan: () => ({
          setAttribute() {},
          addEvent() {},
          end: () => {
            throw new Error('tracer bug')
          },
        }),
      },
    ],
  ] as const) {
    test(`a tracer whose ${what} throws never breaks scheduleRPC or send`, async () => {
      const calls: unknown[][] = []
      const sent: any[] = []
      const tracing = { tracer, logger }
      const id = await traceSchedulerService(
        {
          scheduleRPC: async (...args: unknown[]) => (calls.push(args), 't'),
        } as any,
        wire,
        tracing as any
      ).scheduleRPC(10, 'later', {})
      const result = await traceWebhookService(
        {
          send: async (input: any) => (sent.push(input), { jobId: 'j' }),
        } as any,
        wire,
        tracing as any
      ).send({ url: 'https://example.com/hook', event: 'e' })
      assert.equal(id, 't')
      assert.deepEqual(result, { jobId: 'j' })
      assert.equal(calls.length, 1)
      assert.equal(sent.length, 1)
    })
  }

  test('a webhook delivery job is traced, and the receiver sees no trace', async () => {
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      config: {},
    } as any)
    const { added, queue } = recordingQueue()
    const webhooks = traceWebhookService(new QueueWebhookService(queue), wire)
    await webhooks.send({ url: 'https://example.com/hook', data: {} })
    assert.equal(added[0]!.options.traceparent, CALLER_TRACEPARENT)
    assert.ok(!JSON.stringify(added[0]!.data).includes(CALLER.traceId))
  })
})

describe('a webhook source', () => {
  test('queues each event in the trace of the request', async () => {
    const { added, queue } = recordingQueue()
    await new IncomingWebhookService(queue).accept({
      source: 'stripe',
      request: {} as any,
      events: [{ name: 'paid', data: {} } as any],
      traceparent: CALLER_TRACEPARENT,
    })
    assert.equal(added[0]!.options.traceparent, CALLER_TRACEPARENT)
  })

  test('runs its trigger in the trace of the worker', async () => {
    let seen: string | undefined
    addFunction('onPaid', {
      func: async (_services: any, _data: any, { traceId }: any) => {
        seen = traceId
      },
    } as any)
    pikkuState(null, 'function', 'meta').onPaid = {
      pikkuFuncId: 'onPaid',
      sessionless: true,
    } as any
    pikkuState(null, 'trigger', 'meta')['stripe:paid'] = {
      pikkuFuncId: 'onPaid',
    } as any
    pikkuState(null, 'package', 'singletonServices', { logger } as any)
    await dispatchWebhookSourceJob(
      { source: 'stripe', event: { name: 'paid', data: {} } } as any,
      { trace: CALLER }
    )
    assert.equal(seen, CALLER.traceId)
  })
})

describe('an agent tool', () => {
  const agent = () => {
    pikkuState(null, 'agent', 'agentsMeta').traced = {
      name: 'traced',
      tools: ['see'],
    } as any
    pikkuState(null, 'agent', 'agents').set('traced', {
      name: 'traced',
    } as any)
    pikkuState(null, 'rpc', 'meta').see = 'see'
    pikkuState(null, 'function', 'meta').see = {
      pikkuFuncId: 'see',
      sessionless: true,
    } as any
    pikkuState(null, 'package', 'singletonServices', { logger } as any)
  }

  test('runs as a new span in the trace of the agent caller', async () => {
    agent()
    let seen: any
    pikkuState(null, 'function', 'functions').set('see', {
      func: async (_services: any, _data: any, { trace }: any) => {
        seen = trace
      },
    } as any)
    const { tools } = await buildToolDefs(
      { trace: CALLER },
      new Map<string, string>(),
      'resource-1',
      'traced',
      null,
      undefined,
      []
    )
    await tools[0]!.execute({})
    assert.equal(seen.traceId, CALLER.traceId)
    assert.equal(seen.parentSpanId, CALLER.spanId)
    assert.notEqual(seen.spanId, CALLER.spanId)
  })
})

describe('a live scorer', () => {
  test('grades in the trace of the run', async () => {
    const scorer = pikkuAgentScorer({
      name: 'always',
      description: 'Always one',
      score: async () => ({ score: 1 }),
    } as any)
    pikkuState(null, 'agent', 'agents').set('a', {
      name: 'a',
      scorers: ['always'],
    } as never)
    pikkuState(null, 'agent', 'scorers').set('always', scorer)
    const { added, queue } = recordingQueue()
    await scoreFinishedRun(
      { runId: 'r', agentName: 'a' } as any,
      { logger, queueService: queue } as any,
      CALLER_TRACEPARENT
    )
    assert.equal(added.length, 1)
    assert.equal(added[0]!.options.traceparent, CALLER_TRACEPARENT)
  })
})

describe('channel reverse RPC', () => {
  test('the host sends the trace of the connection', async () => {
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      schema: undefined,
    } as any)
    const handler = new PikkuLocalChannelHandler(
      'c1',
      'chat',
      {},
      logger as any
    )
    handler.trace = CALLER
    const frames: any[] = []
    handler.send = (frame: any) => {
      frames.push(frame)
    }
    void handler
      .getChannel()
      .remote('hello', {})
      .catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.equal(frames[0]?.traceparent, CALLER_TRACEPARENT)
  })

  const receive = async (trustInboundTraceparent?: boolean) => {
    let context: unknown
    const respond = createChannelRPCResponder({
      capabilities: {
        look: {
          needsApproval: false,
          execute: async (_data: unknown, received: unknown) => {
            context = received
          },
        },
      },
      send: () => {},
      trustInboundTraceparent,
    })
    await respond({
      action: CHANNEL_RPC_REQUEST,
      id: '1',
      funcName: 'look',
      data: {},
      traceparent: CALLER_TRACEPARENT,
    })
    return context
  }

  test('a peer that is not trusted names no trace, by default', async () => {
    assert.deepEqual(await receive(), {})
  })

  test('an authenticated peer can be trusted with one', async () => {
    assert.deepEqual(await receive(true), {
      traceparent: CALLER_TRACEPARENT,
    })
  })
})
