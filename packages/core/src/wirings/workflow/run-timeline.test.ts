import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRunTimeline,
  reconstructStateAt,
  reconstructFinalState,
} from './run-timeline.js'
import type { StepState } from './workflow.types.js'

type HistoryEntry = StepState & { stepName: string }

const T = (ms: number) => new Date(1_700_000_000_000 + ms)

const ok = (
  stepName: string,
  base: number,
  opts: { from?: string; result?: unknown; attempt?: number } = {}
): HistoryEntry =>
  ({
    stepId: `${stepName}-${opts.attempt ?? 1}`,
    stepName,
    status: 'succeeded',
    attemptCount: opts.attempt ?? 1,
    fromStepName: opts.from,
    result: opts.result,
    createdAt: T(base),
    runningAt: T(base + 1),
    succeededAt: T(base + 2),
    updatedAt: T(base + 2),
  }) as HistoryEntry

const failed = (
  stepName: string,
  base: number,
  opts: { from?: string; attempt?: number; message?: string } = {}
): HistoryEntry =>
  ({
    stepId: `${stepName}-${opts.attempt ?? 1}`,
    stepName,
    status: 'failed',
    attemptCount: opts.attempt ?? 1,
    fromStepName: opts.from,
    error: { message: opts.message ?? 'boom' },
    createdAt: T(base),
    runningAt: T(base + 1),
    failedAt: T(base + 2),
    updatedAt: T(base + 2),
  }) as HistoryEntry

describe('buildRunTimeline', () => {
  test('explodes each attempt into ordered lifecycle events', () => {
    const tl = buildRunTimeline([ok('begin', 0, { result: { n: 1 } })])
    assert.deepEqual(
      tl.map((e) => e.type),
      ['pending', 'running', 'succeeded']
    )
    assert.deepEqual(
      tl.map((e) => e.seq),
      [0, 1, 2]
    )
    assert.deepEqual(tl[2]!.result, { n: 1 })
    assert.equal(tl[0]!.result, undefined)
  })

  test('orders across steps by timestamp, lifecycle, then history index', () => {
    const tl = buildRunTimeline([
      ok('begin', 0, { result: 1 }),
      ok('next', 2, { from: 'begin', result: 2 }),
    ])
    const at2 = tl.filter((e) => e.at.getTime() === T(2).getTime())
    assert.deepEqual(
      at2.map((e) => `${e.stepName}:${e.type}`),
      ['next:pending', 'begin:succeeded']
    )
  })

  test('carries provenance on the created event only', () => {
    const tl = buildRunTimeline([ok('next', 5, { from: 'begin' })])
    const created = tl.find((e) => e.type === 'pending')!
    assert.equal(created.fromStepName, 'begin')
    assert.equal(
      tl.find((e) => e.type === 'succeeded')!.fromStepName,
      undefined
    )
  })

  test('terminal event is driven by status, not lifecycle timestamps', () => {
    const noStamps = {
      stepId: 's-1',
      stepName: 'begin',
      status: 'succeeded',
      attemptCount: 1,
      result: { ok: 1 },
      createdAt: T(0),
      updatedAt: T(5),
    } as HistoryEntry
    const tl = buildRunTimeline([noStamps])
    assert.deepEqual(
      tl.map((e) => e.type),
      ['pending', 'succeeded']
    )
    const succeeded = tl.find((e) => e.type === 'succeeded')!
    assert.equal(
      succeeded.at.getTime(),
      T(5).getTime(),
      'falls back to updatedAt'
    )
    assert.deepEqual(succeeded.result, { ok: 1 })
    assert.deepEqual(reconstructFinalState(tl).results, { begin: { ok: 1 } })
  })
})

describe('reconstructStateAt', () => {
  const history: HistoryEntry[] = [
    ok('begin', 0, { result: { step: 'begin' } }),
    ok('next', 10, { from: 'begin', result: { step: 'next' } }),
    ok('finish', 20, { from: 'next', result: { step: 'finish' } }),
  ]
  const tl = buildRunTimeline(history)

  test('a point before the first event is the empty initial state', () => {
    const s = reconstructStateAt(tl, -1)
    assert.equal(s.seq, -1)
    assert.deepEqual(s.steps, [])
    assert.deepEqual(s.results, {})
    assert.equal(s.phase, 'pending')
  })

  test('mid-run by seq: only steps up to that event exist', () => {
    const s = reconstructStateAt(tl, 2)
    assert.deepEqual(s.path, ['begin'])
    assert.equal(s.steps[0]!.status, 'succeeded')
    assert.deepEqual(s.results, { begin: { step: 'begin' } })
    assert.equal(s.phase, 'idle')
  })

  test('mid-run captures an in-flight step as running', () => {
    const s = reconstructStateAt(tl, 4)
    assert.deepEqual(s.path, ['begin', 'next'])
    assert.equal(s.steps[1]!.stepName, 'next')
    assert.equal(s.steps[1]!.status, 'running')
    assert.equal(s.steps[1]!.fromStepName, 'begin')
    assert.equal(s.phase, 'running')
    assert.deepEqual(s.results, { begin: { step: 'begin' } })
  })

  test('time-travel by Date folds every event at or before the instant', () => {
    const s = reconstructStateAt(tl, T(12))
    assert.deepEqual(s.path, ['begin', 'next'])
    assert.equal(s.steps[1]!.status, 'succeeded')
    assert.deepEqual(s.results, {
      begin: { step: 'begin' },
      next: { step: 'next' },
    })
  })

  test('final state has the full walked path and all results', () => {
    const s = reconstructFinalState(tl)
    assert.deepEqual(s.path, ['begin', 'next', 'finish'])
    assert.deepEqual(s.results, {
      begin: { step: 'begin' },
      next: { step: 'next' },
      finish: { step: 'finish' },
    })
    assert.equal(s.phase, 'idle')
  })
})

describe('reconstructStateAt — retries', () => {
  const history: HistoryEntry[] = [
    failed('flaky', 0, { message: 'first try' }),
    ok('flaky', 10, { result: { ok: true }, attempt: 2 }),
  ]
  const tl = buildRunTimeline(history)

  test('between attempts the step is failed', () => {
    const s = reconstructStateAt(tl, T(2))
    assert.equal(s.steps[0]!.status, 'failed')
    assert.equal(s.steps[0]!.error?.message, 'first try')
    assert.equal(s.phase, 'failed')
    assert.deepEqual(s.results, {})
  })

  test("the retry's created event reopens the step and clears the error", () => {
    const s = reconstructStateAt(tl, T(10))
    assert.equal(s.steps[0]!.status, 'pending')
    assert.equal(s.steps[0]!.error, undefined)
    assert.equal(s.steps[0]!.attemptCount, 2)
    assert.equal(s.phase, 'running')
  })

  test('after the retry succeeds the result is available', () => {
    const s = reconstructFinalState(tl)
    assert.equal(s.steps[0]!.status, 'succeeded')
    assert.deepEqual(s.results, { flaky: { ok: true } })
    assert.equal(s.path.length, 1, 'a retried step is still one path entry')
  })
})
