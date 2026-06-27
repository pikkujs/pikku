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

/** A succeeded step attempt with the standard lifecycle timestamps. */
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
    // seq is monotonic from 0
    assert.deepEqual(
      tl.map((e) => e.seq),
      [0, 1, 2]
    )
    // result rides only on the succeeded event
    assert.deepEqual(tl[2]!.result, { n: 1 })
    assert.equal(tl[0]!.result, undefined)
  })

  test('orders across steps by timestamp, lifecycle, then history index', () => {
    // two steps; b created at the same instant begin succeeds
    const tl = buildRunTimeline([
      ok('begin', 0, { result: 1 }),
      ok('next', 2, { from: 'begin', result: 2 }),
    ])
    // begin.pending(0) begin.running(1) begin.succeeded(2)==next.pending(2)
    // → succeeded sorts before pending at the same instant (lifecycle 3 vs 0)?
    // No: pending=0 < succeeded=3, so next.pending precedes begin.succeeded.
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
})

describe('reconstructStateAt', () => {
  // begin → next → finish, each succeeding in order
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
    // fold through begin.succeeded (seq 2)
    const s = reconstructStateAt(tl, 2)
    assert.deepEqual(s.path, ['begin'])
    assert.equal(s.steps[0]!.status, 'succeeded')
    assert.deepEqual(s.results, { begin: { step: 'begin' } })
    // next hasn't been created yet at this point
    assert.equal(s.phase, 'idle')
  })

  test('mid-run captures an in-flight step as running', () => {
    // begin done (0,1,2), next created+running (3,4) but not yet succeeded
    const s = reconstructStateAt(tl, 4)
    assert.deepEqual(s.path, ['begin', 'next'])
    assert.equal(s.steps[1]!.stepName, 'next')
    assert.equal(s.steps[1]!.status, 'running')
    assert.equal(s.steps[1]!.fromStepName, 'begin')
    assert.equal(s.phase, 'running')
    // next's result not yet available in the replay cache
    assert.deepEqual(s.results, { begin: { step: 'begin' } })
  })

  test('time-travel by Date folds every event at or before the instant', () => {
    const s = reconstructStateAt(tl, T(12))
    // begin fully done (<=2), next created(10)+running(11) but succeeded at 12
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
  // attempt 1 fails, attempt 2 (created later) succeeds
  const history: HistoryEntry[] = [
    failed('flaky', 0, { message: 'first try' }),
    ok('flaky', 10, { result: { ok: true }, attempt: 2 }),
  ]
  const tl = buildRunTimeline(history)

  test('between attempts the step is failed', () => {
    const s = reconstructStateAt(tl, T(2)) // through failedAt of attempt 1
    assert.equal(s.steps[0]!.status, 'failed')
    assert.equal(s.steps[0]!.error?.message, 'first try')
    assert.equal(s.phase, 'failed')
    assert.deepEqual(s.results, {})
  })

  test("the retry's created event reopens the step and clears the error", () => {
    const s = reconstructStateAt(tl, T(10)) // attempt-2 pending
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
