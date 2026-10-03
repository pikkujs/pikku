import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
  planChecklistProgress,
  planCoverage,
  slotItems,
  type PlanChecklistItem,
} from './plan'

const item = (
  id: string,
  done: boolean,
  deferred = false
): PlanChecklistItem => ({
  id,
  label: id,
  kind: 'function',
  done,
  deferred,
})

describe('slotItems', () => {
  test('a built slot yields what it holds', () => {
    assert.deepEqual(
      slotItems({ kind: 'built', description: 'Two.', items: [1, 2] }),
      [1, 2]
    )
  })

  test('a slot left deliberately empty yields nothing rather than throwing', () => {
    assert.deepEqual(slotItems({ kind: 'n/a', description: 'None yet.' }), [])
  })
})

describe('planChecklistProgress', () => {
  test('counts what the meta can see, not what was claimed', () => {
    assert.deepEqual(
      planChecklistProgress([
        item('function:a', true),
        item('function:b', false),
        item('function:c', true),
      ]),
      { done: 2, total: 3, deferred: 0 }
    )
  })

  test('a deferred item stays in the total, and is counted again as deferred', () => {
    // Subtracting it would let a plan discharge itself by deferring its own
    // second half: the bar would read full while nothing more was built.
    assert.deepEqual(
      planChecklistProgress([
        item('function:a', true),
        item('function:b', false, true),
      ]),
      { done: 1, total: 2, deferred: 1 }
    )
  })

  test('a deferred item that was built anyway counts as done, not as deferred', () => {
    assert.deepEqual(planChecklistProgress([item('function:a', true, true)]), {
      done: 1,
      total: 1,
      deferred: 0,
    })
  })

  test('an empty checklist is not a division waiting to happen', () => {
    assert.deepEqual(planChecklistProgress([]), {
      done: 0,
      total: 0,
      deferred: 0,
    })
  })
})

describe('planCoverage', () => {
  test('counts only the rows the caller named', () => {
    const checklist = [
      item('function:a', true),
      item('function:b', false),
      item('scope:x', true),
    ]
    assert.deepEqual(planCoverage(checklist, ['function:a', 'function:b']), {
      done: 1,
      total: 2,
    })
  })

  test('an id with no row contributes nothing rather than an unbuilt one', () => {
    // A section asking about something the reconcile never produced a row for —
    // a scenario with no `name`, say — must not read as a thing left unbuilt.
    assert.deepEqual(planCoverage([item('function:a', true)], ['scope:gone']), {
      done: 0,
      total: 0,
    })
  })
})
