import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { IntentStack, intentsForPersona } from './virtual-user-intents.js'
import { createRng } from './virtual-user-rng.js'
import {
  DISPOSITIONS,
  type DispositionProfile,
} from './virtual-user-dispositions.js'
import type { IntentSource } from './virtual-user.types.js'

const profileWith = (
  moves: DispositionProfile['moves']
): DispositionProfile => ({ ...DISPOSITIONS.realistic, moves })

const ONLY_CONTINUE = profileWith({
  continue: 1,
  suspend: 0,
  resume: 0,
  abandon: 0,
})
const ONLY_SUSPEND = profileWith({
  continue: 0,
  suspend: 1,
  resume: 0,
  abandon: 0,
})
const ONLY_ABANDON = profileWith({
  continue: 0,
  suspend: 0,
  resume: 0,
  abandon: 1,
})

const sources = (count: number): IntentSource[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `source_${i}`,
    title: `do thing ${i}`,
  }))

describe('intent stack', () => {
  test('nothing to do means no tick at all', () => {
    const stack = new IntentStack([], createRng(1), ONLY_CONTINUE)
    assert.equal(stack.next(0), null)
    assert.deepEqual(stack.records(), [])
  })

  test('the first tick always starts something', () => {
    const stack = new IntentStack(sources(2), createRng(1), ONLY_SUSPEND)
    const tick = stack.next(0)
    assert.equal(tick?.move, 'start')
    assert.equal(tick?.intent.status, 'open')
  })

  test('continue keeps the same intent live and records the step', () => {
    const stack = new IntentStack(sources(3), createRng(1), ONLY_CONTINUE)
    const first = stack.next(0)!
    for (let step = 1; step < 5; step++) {
      const tick = stack.next(step)!
      assert.equal(tick.move, 'continue')
      assert.equal(tick.intent.id, first.intent.id)
    }
    const [record] = stack.records()
    assert.deepEqual(record!.steps, [0, 1, 2, 3, 4])
  })

  test('completing frees the stack to schedule the next thing', () => {
    const stack = new IntentStack(sources(2), createRng(1), ONLY_CONTINUE)
    const first = stack.next(0)!
    stack.complete('got what I came for')
    const second = stack.next(1)!
    assert.notEqual(second.intent.id, first.intent.id)
    assert.equal(second.move, 'start')

    const completed = stack.records().find((r) => r.id === first.intent.id)!
    assert.equal(completed.status, 'completed')
    assert.equal(completed.summary, 'got what I came for')
  })

  test('a run ends once every intent is seen through', () => {
    const stack = new IntentStack(sources(2), createRng(1), ONLY_CONTINUE)
    stack.next(0)
    stack.complete()
    stack.next(1)
    stack.complete()
    assert.equal(stack.next(2), null)
    assert.deepEqual(
      stack.records().map((r) => r.status),
      ['completed', 'completed']
    )
  })

  test('suspending switches to something else and counts the interruption', () => {
    const stack = new IntentStack(sources(2), createRng(1), ONLY_SUSPEND)
    const first = stack.next(0)!
    const second = stack.next(1)!
    assert.equal(second.move, 'suspend')
    assert.notEqual(second.intent.id, first.intent.id)

    const suspended = stack.records().find((r) => r.id === first.intent.id)!
    assert.equal(suspended.status, 'suspended')
    assert.equal(suspended.suspensions, 1)
  })

  test('a suspended intent gets picked back up, not lost', () => {
    const stack = new IntentStack(sources(2), createRng(1), ONLY_SUSPEND)
    const first = stack.next(0)!
    stack.next(1)
    // Nowhere new to start now, so the suspended one is the only candidate.
    const third = stack.next(2)!
    assert.equal(third.intent.id, first.intent.id)
    assert.equal(third.intent.status, 'open')
  })

  test('a move with nowhere to go degrades to continue rather than stalling', () => {
    const stack = new IntentStack(sources(1), createRng(1), ONLY_SUSPEND)
    const first = stack.next(0)!
    const second = stack.next(1)!
    assert.equal(second.move, 'continue')
    assert.equal(second.intent.id, first.intent.id)
    // The interruption never happened, so it must not be counted as one.
    assert.equal(stack.records()[0]!.suspensions, 0)
    assert.equal(stack.records()[0]!.status, 'open')
  })

  test('abandoning is final — the user does not quietly come back to it', () => {
    const stack = new IntentStack(sources(1), createRng(1), ONLY_ABANDON)
    stack.next(0)
    assert.equal(stack.next(1), null)
    assert.equal(stack.records()[0]!.status, 'abandoned')
  })

  test('stuck records why the user could not get there', () => {
    const stack = new IntentStack(sources(1), createRng(1), ONLY_CONTINUE)
    stack.next(0)
    stack.stuck('no endpoint accepts an invite')
    const [record] = stack.records()
    assert.equal(record!.status, 'stuck')
    assert.equal(record!.summary, 'no endpoint accepts an invite')
  })

  test('a distractible user still only juggles so many things at once', () => {
    const stack = new IntentStack(sources(10), createRng(4), ONLY_SUSPEND, 3)
    for (let step = 0; step < 40; step++) {
      stack.next(step)
      const live = stack
        .records()
        .filter((r) => r.status === 'open' || r.status === 'suspended')
      assert.ok(live.length <= 3, `juggling ${live.length}`)
    }
  })

  test('the same seed schedules the same run', () => {
    const schedule = (seed: number) => {
      const stack = new IntentStack(
        sources(5),
        createRng(seed),
        DISPOSITIONS.careless
      )
      return Array.from({ length: 30 }, (_, step) => {
        const tick = stack.next(step)
        return tick ? `${tick.move}:${tick.intent.source.id}` : 'end'
      })
    }
    assert.deepEqual(schedule(123), schedule(123))
    assert.notDeepEqual(schedule(123), schedule(456))
  })

  test('a careless user interrupts itself far more than a careful one', () => {
    const suspensions = (profile: DispositionProfile) => {
      const stack = new IntentStack(sources(6), createRng(21), profile)
      for (let step = 0; step < 200; step++) stack.next(step)
      return stack
        .records()
        .reduce((total, record) => total + record.suspensions, 0)
    }
    assert.ok(
      suspensions(DISPOSITIONS.careless) >
        suspensions(DISPOSITIONS.realistic) * 2
    )
  })
})

describe('intents for an actor', () => {
  const catalogue: IntentSource[] = [
    { id: 'a', title: 'invite a teammate', personas: ['orgAdmin'] },
    { id: 'b', title: 'read the dashboard' },
    {
      id: 'c',
      title: 'deploy a stage',
      personas: ['platformAdmin', 'orgAdmin'],
    },
  ]

  test('an actor gets what names it, plus anything that names nobody', () => {
    assert.deepEqual(
      intentsForPersona(catalogue, 'orgAdmin').map((i) => i.id),
      ['a', 'b', 'c']
    )
  })

  test('an actor is not given other people’s work', () => {
    assert.deepEqual(
      intentsForPersona(catalogue, 'member').map((i) => i.id),
      ['b']
    )
  })

  test('an empty actor list means everyone', () => {
    assert.deepEqual(
      intentsForPersona(
        [{ id: 'x', title: 'anything', personas: [] }],
        'nobody'
      ),
      [{ id: 'x', title: 'anything', personas: [] }]
    )
  })
})
