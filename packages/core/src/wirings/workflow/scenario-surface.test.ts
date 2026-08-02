import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveScenarioSurfaces, witnessesAgree } from './scenario-surface.js'
import type { ScenarioSurface } from './scenario-step.types.js'

const ALL: ScenarioSurface[] = ['browser', 'cli', 'default']

describe('action steps pick exactly one binding', () => {
  test('runs the binding the run asked for', () => {
    assert.deepEqual(resolveScenarioSurfaces('when', ALL, 'browser'), {
      kind: 'action',
      surface: 'browser',
      fellBack: false,
    })
  })

  test('falls back to default and says so when the surface is not implemented', () => {
    assert.deepEqual(resolveScenarioSurfaces('when', ['default'], 'browser'), {
      kind: 'action',
      surface: 'default',
      fellBack: true,
    })
  })

  test('given and step resolve like when, not like then', () => {
    for (const phase of ['given', 'step'] as const) {
      const resolution = resolveScenarioSurfaces(phase, ALL, 'cli')
      assert.equal(resolution.kind, 'action')
    }
  })

  test('a default run never counts as a fallback', () => {
    assert.deepEqual(resolveScenarioSurfaces('when', ['default'], 'default'), {
      kind: 'action',
      surface: 'default',
      fellBack: false,
    })
  })
})

describe('then steps run every witness', () => {
  test('a browser run checks the page AND the system of record', () => {
    assert.deepEqual(
      resolveScenarioSurfaces('then', ['browser', 'default'], 'browser'),
      { kind: 'witness', surfaces: ['browser', 'default'], unwitnessed: false }
    )
  })

  test('the surface witness comes first, so its failure is the one reported', () => {
    const resolution = resolveScenarioSurfaces(
      'then',
      ['default', 'browser'],
      'browser'
    )
    assert.equal(resolution.kind, 'witness')
    assert.deepEqual(
      resolution.kind === 'witness' ? resolution.surfaces[0] : null,
      'browser'
    )
  })

  test('a default run is unchanged — one witness, no extra cost', () => {
    assert.deepEqual(
      resolveScenarioSurfaces('then', ['browser', 'default'], 'default'),
      { kind: 'witness', surfaces: ['default'], unwitnessed: false }
    )
  })

  test('no witness for the run surface is flagged rather than excused', () => {
    assert.deepEqual(resolveScenarioSurfaces('then', ['default'], 'browser'), {
      kind: 'witness',
      surfaces: ['default'],
      unwitnessed: true,
    })
  })

  test('a browser-only assertion has nothing to run on a default run', () => {
    // No witness at all is not a coverage statistic — nothing checked anything,
    // so `unwitnessed` stays false and the caller is expected to fail the step.
    assert.deepEqual(resolveScenarioSurfaces('then', ['browser'], 'default'), {
      kind: 'witness',
      surfaces: [],
      unwitnessed: false,
    })
  })

  test('an assertion that runs nowhere is not counted as merely unwitnessed', () => {
    assert.deepEqual(resolveScenarioSurfaces('then', ['browser'], 'cli'), {
      kind: 'witness',
      surfaces: [],
      unwitnessed: false,
    })
  })

  test('unwitnessed means checked somewhere else, never checked nowhere', () => {
    const ranElsewhere = resolveScenarioSurfaces('then', ['default'], 'cli')
    assert.equal(ranElsewhere.kind, 'witness')
    assert.ok(
      ranElsewhere.kind === 'witness' && ranElsewhere.surfaces.length > 0,
      'the two states are disjoint: unwitnessed always has something that ran'
    )
    assert.equal(
      ranElsewhere.kind === 'witness' && ranElsewhere.unwitnessed,
      true
    )
  })
})

describe('witness agreement', () => {
  test('key order does not make two observations disagree', () => {
    assert.equal(
      witnessesAgree(
        { status: 'paid', total: 500 },
        { total: 500, status: 'paid' }
      ),
      true
    )
  })

  test('a page showing something else is a disagreement', () => {
    assert.equal(
      witnessesAgree({ status: 'paid' }, { status: 'pending' }),
      false
    )
  })

  test('a witness that asserted by throwing is not compared', () => {
    assert.equal(witnessesAgree(undefined, { status: 'paid' }), true)
    assert.equal(witnessesAgree({ status: 'paid' }, undefined), true)
  })

  test('nested observations compare structurally', () => {
    assert.equal(
      witnessesAgree(
        { order: { items: [{ sku: 'a' }, { sku: 'b' }] } },
        { order: { items: [{ sku: 'a' }, { sku: 'b' }] } }
      ),
      true
    )
    assert.equal(
      witnessesAgree({ items: ['a', 'b'] }, { items: ['b', 'a'] }),
      false
    )
  })
})
