import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { ConflictError } from '../errors/errors.js'
import { AbandonedError } from '../function/abort-scope.js'
import { addFunction } from '../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../pikku-state.js'
import { parseTraceparent, type TraceContext } from '../trace.js'
import type { SecretService } from '../services/secret-service.js'
import type { QueueService } from '../wirings/queue/queue.types.js'
import { SignedQueueService } from '../wirings/queue/signed-queue-service.js'

/** A real queue adapter, as this suite needs it. */
export type QueueTraceAdapter = {
  service: QueueService
  /** Registers workers for what `registerQueue` declared. */
  startWorkers: () => Promise<void>
  /** Stops workers and closes every connection. */
  stop: () => Promise<void>
  /** Publishes `payload` as it stands, as a producer older than tracing did. */
  publishRaw: (queueName: string, payload: unknown) => Promise<void>
  /** The trace travels in the payload, so a worker unwraps what it is given. */
  envelope?: boolean
}

const OUTCOMES = [
  'success',
  'throw-pikku-error',
  'throw-plain-error',
  'job-failed',
  'job-discarded',
  'abandoned',
] as const
const INBOUNDS = ['none', 'valid', 'invalid', 'forged'] as const
const TIMINGS = [
  'immediate',
  'delayed',
  'retried',
  'duplicate',
  'concurrent',
] as const

type Outcome = (typeof OUTCOMES)[number]
type Inbound = (typeof INBOUNDS)[number]
type Timing = (typeof TIMINGS)[number]
type Job = { id: string; outcome: Outcome; failFirst?: boolean }
type Attempt = { trace: TraceContext; data: unknown }
type Log = { level: string; scope?: string }

const hex = (length: number) =>
  Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')

const inboundFor = (inbound: Inbound) => {
  switch (inbound) {
    case 'none':
      return undefined
    case 'valid':
      return `00-1${hex(31)}-2${hex(15)}-01`
    case 'invalid':
      return `not-a-traceparent-${hex(4)}`
    case 'forged':
      return `00-${'0'.repeat(32)}-${hex(16)}-01`
  }
}

const expectedAttempts = (outcome: Outcome, timing: Timing) => {
  if (timing === 'duplicate') return 2
  if (timing !== 'retried') return 1
  return outcome === 'job-discarded' ? 1 : 2
}

const SEEDED_SECRETS = {
  getSecret: async () => ({ reveal: () => 'x'.repeat(64) }),
  hasSecret: async () => true,
} as never as SecretService

/**
 * Runs each outcome × inbound × timing as one job through a real adapter, in one
 * batch so it stays fast against a broker, then jobs in the formats of older and
 * newer producers. Asserts on what the worker saw, so a wire format that loses
 * or changes the trace fails here on the adapter that has it.
 *
 * @param name - The adapter, for the test names.
 * @param create - Connects the adapter.
 * @param options.settleMs - How long a batch may take, retries included.
 */
export const defineQueueTraceConformance = (
  name: string,
  create: () => Promise<QueueTraceAdapter>,
  { settleMs = 30_000 }: { settleMs?: number } = {}
) => {
  describe(`${name}: a job keeps its trace`, () => {
    const queue = `trace_conformance_${hex(8)}`
    const attempts = new Map<string, Attempt[]>()
    const logs: Log[] = []
    let adapter: QueueTraceAdapter
    const sent = new Map<
      string,
      {
        label: string
        traceparent?: string
        inbound: Inbound
        expected: number
      }
    >()

    const logger = (scope?: string): any => {
      const write = (level: string) => () => void logs.push({ level, scope })
      return {
        info: write('info'),
        warn: write('warn'),
        debug: write('debug'),
        error: write('error'),
        scope: (traceId: string) => logger(traceId),
      }
    }

    const worker = async (_services: any, data: any, wire: any) => {
      const key = String(data?.id ?? data?.data?.id ?? data)
      const seen = attempts.get(key) ?? []
      seen.push({ trace: wire.trace, data })
      attempts.set(key, seen)
      if (data?.failFirst && seen.length === 1 && data.outcome === 'success') {
        throw new Error('flaky')
      }
      switch (data?.outcome as Outcome | undefined) {
        case 'throw-pikku-error':
          throw new ConflictError('refused')
        case 'throw-plain-error':
          throw new Error('boom')
        case 'job-failed':
          return wire.queue.fail('no')
        case 'job-discarded':
          return wire.queue.discard('no')
        case 'abandoned':
          throw new AbandonedError('the caller left')
      }
    }

    before(async () => {
      resetPikkuState()
      pikkuState(null, 'package', 'singletonServices', {
        logger: logger(),
        config: {},
        secrets: SEEDED_SECRETS,
      } as never)
      const funcId = `queue_${queue}`
      pikkuState(null, 'queue', 'meta')[queue] = {
        pikkuFuncId: funcId,
        name: queue,
      } as never
      pikkuState(null, 'function', 'meta')[funcId] = {
        pikkuFuncId: funcId,
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: true,
      } as never
      addFunction(funcId, { func: worker, auth: false } as never)
      pikkuState(null, 'queue', 'registrations').set(queue, {
        name: queue,
        func: { func: worker, auth: false },
      } as never)
      adapter = await create()
      await adapter.startWorkers()

      const adds: Array<Promise<unknown>> = []
      for (const outcome of OUTCOMES) {
        for (const inbound of INBOUNDS) {
          for (const timing of TIMINGS) {
            for (const copy of timing === 'concurrent' ? [0, 1] : [0]) {
              const id = hex(16)
              const label = `${outcome} / ${inbound} / ${timing}${copy ? ' #2' : ''}`
              const traceparent = inboundFor(inbound)
              const job: Job = {
                id,
                outcome,
                failFirst: timing === 'retried',
              }
              sent.set(id, {
                label,
                traceparent,
                inbound,
                expected: expectedAttempts(outcome, timing),
              })
              const options = {
                traceparent,
                attempts: timing === 'retried' ? 2 : 1,
                backoff: { type: 'fixed' as const, delay: 10 },
                ...(timing === 'delayed' ? { delay: 50 } : {}),
              }
              adds.push(adapter.service.add(queue, job as never, options))
              if (timing === 'duplicate') {
                adds.push(adapter.service.add(queue, job as never, options))
              }
            }
          }
        }
      }
      await Promise.all(adds)

      const deadline = Date.now() + settleMs
      const pending = () =>
        [...sent].filter(
          ([id, { expected }]) => (attempts.get(id)?.length ?? 0) < expected
        )
      while (pending().length && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    })

    after(async () => {
      await adapter.stop()
    })

    test('every job ran as often as it should', () => {
      const short = [...sent]
        .filter(
          ([id, { expected }]) => (attempts.get(id)?.length ?? 0) !== expected
        )
        .map(([id, { label }]) => `${label}: ${attempts.get(id)?.length ?? 0}`)
      assert.deepEqual(short, [])
    })

    for (const outcome of OUTCOMES) {
      for (const inbound of INBOUNDS) {
        for (const timing of TIMINGS) {
          test(`${outcome} / ${inbound} / ${timing}`, () => {
            const jobs = [...sent].filter(([, { label }]) =>
              label.startsWith(`${outcome} / ${inbound} / ${timing}`)
            )
            assert.ok(jobs.length > 0)
            for (const [id, { traceparent }] of jobs) {
              const seen = (attempts.get(id) ?? []).map(({ trace }) => trace)
              assert.ok(seen.length > 0, 'the job never ran')
              const carried = parseTraceparent(traceparent)
              for (const trace of seen) {
                assert.match(trace.traceId, /^[0-9a-f]{32}$/)
                assert.match(trace.spanId, /^[0-9a-f]{16}$/)
                if (carried) {
                  assert.equal(trace.traceId, carried.traceId, 'trace changed')
                  assert.equal(trace.parentSpanId, carried.parentSpanId)
                } else {
                  assert.equal(trace.parentSpanId, undefined, 'not a new trace')
                  if (traceparent) {
                    assert.ok(!traceparent.includes(trace.traceId), 'adopted')
                  }
                }
              }
              const spans = seen.map(({ spanId }) => spanId)
              assert.equal(new Set(spans).size, spans.length, 'a span repeats')
            }
          })
        }
      }
    }

    test('error logs from running a job carry its trace', () => {
      const traces = new Set(
        [...attempts.values()].flat().map(({ trace }) => trace.traceId)
      )
      const failures = logs.filter(
        ({ level, scope }) => level === 'error' && scope
      )
      assert.ok(failures.length > 0, 'no failure was logged')
      for (const { scope } of failures) {
        assert.ok(traces.has(scope!), `a log carries a stray trace ${scope}`)
      }
    })

    describe('jobs from producers of every age', () => {
      const run = async (id: string, publish: () => Promise<unknown>) => {
        await publish()
        const deadline = Date.now() + settleMs
        while (!attempts.get(id)?.length && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        const [attempt] = attempts.get(id) ?? []
        assert.ok(attempt, 'the job never ran')
        return attempt
      }

      test('old format: no trace at all', async () => {
        const data = { id: hex(16), outcome: 'success' }
        const { trace, data: seen } = await run(data.id, () =>
          adapter.publishRaw(queue, data)
        )
        assert.deepEqual(seen, data)
        assert.equal(trace.parentSpanId, undefined)
      })

      test('new format: a trace alongside a signed identity', async () => {
        const data = { id: hex(16), outcome: 'success' }
        const traceparent = inboundFor('valid')!
        const signed = new SignedQueueService(
          adapter.service,
          SEEDED_SECRETS,
          logger()
        )
        const { trace, data: seen } = await run(data.id, () =>
          signed.add(queue, data as never, {
            traceparent,
            pikkuUserId: 'user-1',
          })
        )
        assert.deepEqual(seen, data)
        assert.equal(trace.traceId, parseTraceparent(traceparent)!.traceId)
      })

      test('data shaped like the envelope, with and without a trace', async () => {
        for (const traceparent of [undefined, inboundFor('valid')]) {
          const id = hex(16)
          const shaped = { __pikkuTraceparent: 'mine', data: { id } }
          const key = `shaped-${id}`
          const { data } = await run(key, () =>
            adapter.service.add(queue, { ...shaped, id: key } as never, {
              traceparent,
            })
          )
          assert.deepEqual(data, { ...shaped, id: key })
        }
      })

      test('a poison envelope starts a new trace and keeps the data', async () => {
        const id = hex(16)
        const inner = { id, outcome: 'success' }
        const poison = { __pikkuTraceparent: 'garbage', data: inner }
        const { trace, data } = await run(id, () =>
          adapter.publishRaw(queue, poison)
        )
        assert.equal(trace.parentSpanId, undefined)
        assert.deepEqual(data, adapter.envelope ? inner : poison)
      })
    })
  })
}
