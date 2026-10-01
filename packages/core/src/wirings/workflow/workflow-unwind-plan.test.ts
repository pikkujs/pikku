import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { planUnwind, type UnwindRecord } from './workflow-unwind-plan.js'
import type { StepStatus } from './workflow.types.js'

const at = (t: number) => new Date(1_000_000 + t)

const step = (
  stepName: string,
  start: number,
  end: number,
  status: StepStatus = 'succeeded',
  extra: Partial<UnwindRecord> = {}
): UnwindRecord => ({
  stepName,
  rpcName:
    stepName.startsWith('__') || stepName.endsWith(':compensate')
      ? null
      : stepName,
  status,
  createdAt: at(start),
  updatedAt: at(end),
  ...(status === 'succeeded' ? { succeededAt: at(end) } : {}),
  ...(status === 'failed' ? { failedAt: at(end) } : {}),
  ...extra,
})

const plan = (
  records: UnwindRecord[],
  options: { skip?: string[]; children?: string[] } = {}
) =>
  planUnwind({
    records,
    skip: new Set(options.skip ?? []),
    hasCompensation: (r) => !!r.rpcName,
    isChildWorkflow: (r) => !!options.children?.includes(r.stepName),
  })

const names = (records: UnwindRecord[]) => records.map((r) => r.stepName)

describe('planUnwind', () => {
  test('nothing to compensate settles immediately with no compensation', () => {
    const p = plan([])
    assert.equal(p.settled, true)
    assert.equal(p.compensated, false)
    assert.deepEqual(p.ready, [])
  })

  test('sequential steps unwind one at a time, newest first', () => {
    const records = [step('a', 0, 10), step('b', 10, 20), step('c', 20, 30)]
    assert.deepEqual(names(plan(records).ready), ['c'])
    assert.equal(plan(records).states.get('a'), 'waiting')
  })

  test('once the newest is compensated the next becomes ready', () => {
    const records = [
      step('a', 0, 10),
      step('b', 10, 20),
      step('c', 20, 30),
      step('c:compensate', 31, 32),
    ]
    assert.deepEqual(names(plan(records).ready), ['b'])
  })

  test('parallel siblings are independent and ready together', () => {
    const records = [step('a', 0, 10), step('b', 10, 20), step('c', 10, 25)]
    const p = plan(records)
    assert.deepEqual(names(p.ready).sort(), ['b', 'c'])
    assert.equal(p.states.get('a'), 'waiting')
  })

  test('a stuck step blocks the steps before it but not its siblings', () => {
    const records = [
      step('a', 0, 10),
      step('b', 10, 20),
      step('c', 10, 25),
      step('b:compensate', 26, 27, 'failed', {
        error: { message: 'cannot undo b' },
      }),
    ]
    const p = plan(records)
    assert.equal(p.states.get('b'), 'stuck')
    assert.equal(p.states.get('a'), 'blocked')
    assert.deepEqual(names(p.ready), ['c'])
    assert.deepEqual(p.stuck, [{ stepName: 'b', error: 'cannot undo b' }])
  })

  test('the plan is settled once every reachable compensation is done or stuck', () => {
    const records = [
      step('a', 0, 10),
      step('b', 10, 20),
      step('b:compensate', 21, 22, 'failed', { error: { message: 'x' } }),
    ]
    const p = plan(records)
    assert.equal(p.settled, true)
    assert.equal(p.compensated, false)
  })

  test('a running compensation keeps the plan open and stays ready to re-drive', () => {
    const records = [step('a', 0, 10), step('a:compensate', 11, 11, 'running')]
    const p = plan(records)
    assert.equal(p.settled, false)
    assert.deepEqual(names(p.ready), ['a'])
  })

  test('a failed step is a candidate and is compensated as the newest', () => {
    const records = [step('a', 0, 10), step('b', 10, 20, 'failed')]
    const p = plan(records)
    assert.deepEqual(names(p.ready), ['b'])
  })

  test('steps still in flight hold the plan back until they finish', () => {
    const records = [step('a', 0, 10), step('b', 10, 10, 'running')]
    const p = plan(records)
    assert.equal(p.forwardInFlight, true)
    assert.deepEqual(p.ready, [])
    assert.equal(p.settled, false)
  })

  test('steps without a compensation are not candidates', () => {
    const p = planUnwind({
      records: [step('a', 0, 10), step('b', 10, 20)],
      skip: new Set(),
      hasCompensation: (r) => r.stepName === 'a',
      isChildWorkflow: () => false,
    })
    assert.deepEqual(names(p.candidates), ['a'])
  })

  test('skipped steps are not candidates', () => {
    const p = plan([step('a', 0, 10), step('b', 10, 20)], { skip: ['b'] })
    assert.deepEqual(names(p.ready), ['a'])
  })

  test('only the latest succeeded milestone bounds the unwind', () => {
    const records = [
      step('a', 0, 10),
      step('__milestone__:one', 10, 11),
      step('b', 11, 20),
      step('__milestone__:two', 20, 21),
      step('c', 21, 30),
    ]
    const p = plan(records)
    assert.deepEqual(names(p.candidates), ['c'])
    assert.equal(p.restedAt, 'two')
  })

  test('milestones and compensation rows are never candidates', () => {
    const p = plan([step('__milestone__:m', 0, 1), step('a:compensate', 2, 3)])
    assert.deepEqual(p.candidates, [])
  })

  test('same-millisecond steps are ordered by record order, not deadlocked', () => {
    const records = [step('a', 0, 0), step('b', 0, 0), step('c', 0, 0)]
    const p = plan(records)
    assert.deepEqual(names(p.ready), ['c'])
  })

  test('same-millisecond milestone keeps later steps after it', () => {
    const records = [
      step('a', 0, 0),
      step('__milestone__:m', 0, 0),
      step('b', 0, 0),
    ]
    assert.deepEqual(names(plan(records).candidates), ['b'])
  })

  test('a failed child workflow row is not compensated by the parent', () => {
    const records = [step('a', 0, 10), step('child', 10, 20, 'failed')]
    const p = plan(records, { children: ['child'] })
    assert.deepEqual(names(p.candidates), ['a'])
  })

  test('a succeeded child workflow is a candidate', () => {
    const records = [step('a', 0, 10), step('child', 10, 20)]
    const p = plan(records, { children: ['child'] })
    assert.deepEqual(names(p.ready), ['child'])
  })

  test('a child that rested at its own milestone stops the parent unwind there', () => {
    const records = [
      step('a', 0, 10),
      step('child', 10, 20),
      step('child:compensate', 21, 22, 'succeeded', {
        result: { restedAt: 'safe' },
      }),
    ]
    const p = plan(records, { children: ['child'] })
    assert.equal(p.states.get('child'), 'rested')
    assert.equal(p.states.get('a'), 'blocked')
    assert.equal(p.childRestedAt, 'safe')
    assert.equal(p.compensated, true)
    assert.equal(p.settled, true)
  })

  test('a fully compensated plan reports compensated', () => {
    const records = [step('a', 0, 10), step('a:compensate', 11, 12)]
    const p = plan(records)
    assert.equal(p.compensated, true)
    assert.equal(p.settled, true)
  })

  test('a scheduled compensation counts as running', () => {
    const p = plan([
      step('a', 0, 10),
      step('a:compensate', 11, 11, 'scheduled'),
    ])
    assert.equal(p.states.get('a'), 'running')
    assert.deepEqual(p.ready, [])
  })

  test('a pending compensation was never dispatched, so it is ready again', () => {
    const p = plan([step('a', 0, 10), step('a:compensate', 11, 11, 'pending')])
    assert.deepEqual(names(p.ready), ['a'])
    assert.equal(p.settled, false)
  })
})
