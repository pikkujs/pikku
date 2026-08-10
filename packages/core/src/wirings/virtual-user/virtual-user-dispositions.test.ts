import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  DISPOSITIONS,
  dispositionProfile,
} from './virtual-user-dispositions.js'

describe('resolving a disposition profile', () => {
  test('an unknown disposition falls back to realistic rather than throwing', () => {
    assert.equal(
      dispositionProfile('nonsense' as never),
      DISPOSITIONS.realistic
    )
  })

  test('with no tuning the profile is the shared one, untouched', () => {
    assert.equal(dispositionProfile('careless'), DISPOSITIONS.careless)
  })

  test('a tuned dial overrides, and the rest of the disposition survives', () => {
    const profile = dispositionProfile('careless', { repeatRate: 0.35 })
    assert.equal(profile.repeatRate, 0.35)
    assert.equal(profile.temperature, DISPOSITIONS.careless.temperature)
    assert.deepEqual(profile.moves, DISPOSITIONS.careless.moves)
    // Tuning one user must not tune every user sharing the disposition.
    assert.equal(DISPOSITIONS.careless.repeatRate, 0.18)
  })

  test('moves merge per weight, so overriding one keeps the other three', () => {
    const profile = dispositionProfile('realistic', { moves: { suspend: 30 } })
    assert.deepEqual(profile.moves, {
      ...DISPOSITIONS.realistic.moves,
      suspend: 30,
    })
  })

  // Spreading an optional value in is ordinary code; it must not read as a
  // request to blank the dial.
  test('an explicit undefined leaves the default alone', () => {
    const profile = dispositionProfile('careless', {
      temperature: undefined,
      moves: { abandon: undefined },
    })
    assert.equal(profile.temperature, DISPOSITIONS.careless.temperature)
    assert.equal(profile.moves.abandon, DISPOSITIONS.careless.moves.abandon)
  })

  test('instructions append, so a tuned careless user is still careless', () => {
    const profile = dispositionProfile('careless', {
      instructions: 'Paste ids from other tabs.',
    })
    assert.ok(
      profile.instructions.startsWith(DISPOSITIONS.careless.instructions)
    )
    assert.ok(profile.instructions.endsWith('Paste ids from other tabs.'))
  })

  test('the oracle and the read-only guard are tunable like any other dial', () => {
    // An auditor allowed to write is a legitimate user to declare; the point is
    // that it is declared rather than being a surprise at run time.
    const writingAuditor = dispositionProfile('auditor', { readOnly: false })
    assert.equal(writingAuditor.readOnly, false)
    assert.equal(writingAuditor.reReadRate, DISPOSITIONS.auditor.reReadRate)

    const suspicious = dispositionProfile('realistic', { invertedOracle: true })
    assert.equal(suspicious.invertedOracle, true)
  })
})
