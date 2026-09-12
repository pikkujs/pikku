import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import {
  bucketOf,
  resolveFlag,
  resolveFlagForClient,
  subjectIdOf,
} from './resolve-flag.js'
import type { FlagConfigSnapshot } from './flag.types.js'
import type { CoreUserSession } from '../../types/core.types.js'

const session = (scopes?: string[], orgId?: string): CoreUserSession =>
  ({ userId: 'user-1', orgId, scopes }) as CoreUserSession

const config = (
  overrides: Partial<FlagConfigSnapshot['x']> = {}
): FlagConfigSnapshot => ({
  sandboxes: {
    enabled: false,
    rolloutPercent: null,
    overrides: {},
    ...overrides,
  },
})

describe('subjectIdOf', () => {
  test('prefers the organization', () => {
    assert.equal(
      subjectIdOf({ organizationId: 'org-1', userId: 'user-1' }),
      'org-1'
    )
  })

  test('falls back to the user', () => {
    assert.equal(subjectIdOf({ userId: 'user-1' }), 'user-1')
  })

  test('reads an empty string as no subject', () => {
    assert.equal(subjectIdOf({ organizationId: '' }), undefined)
  })
})

describe('bucketOf', () => {
  test('is deterministic', () => {
    assert.equal(bucketOf('a', 'org-1'), bucketOf('a', 'org-1'))
  })

  test('is salted by flag, so two flags do not select the same half', () => {
    assert.notEqual(bucketOf('a', 'org-1'), bucketOf('b', 'org-1'))
  })

  test('stays inside the basis points range', () => {
    for (let i = 0; i < 200; i++) {
      const bucket = bucketOf('flag', `org-${i}`)
      assert.ok(bucket >= 0 && bucket < 10_000)
    }
  })
})

describe('resolveFlag availability', () => {
  test('an unknown flag fails open', () => {
    const state = resolveFlag('nope', undefined, session(), {})
    assert.equal(state.available, true)
  })

  test('a switched-off flag is unavailable', () => {
    const state = resolveFlag('sandboxes', undefined, session(), config())
    assert.equal(state.available, false)
  })

  test('an override wins over the switch', () => {
    const state = resolveFlag(
      'sandboxes',
      undefined,
      session(undefined, 'org-1'),
      config({ overrides: { 'org-1': true } })
    )
    assert.equal(state.available, true)
  })

  test('an override can also exclude, inside a full rollout', () => {
    const state = resolveFlag(
      'sandboxes',
      undefined,
      session(undefined, 'org-1'),
      config({
        enabled: true,
        rolloutPercent: 100,
        overrides: { 'org-1': false },
      })
    )
    assert.equal(state.available, false)
  })

  test('an explicit subject beats the session, for a sessionless caller', () => {
    const state = resolveFlag(
      'sandboxes',
      undefined,
      undefined,
      config({ overrides: { 'org-7': true } }),
      { organizationId: 'org-7' }
    )
    assert.equal(state.available, true)
  })

  test('no subject skips the bucket rather than failing it', () => {
    const state = resolveFlag('sandboxes', undefined, undefined, {
      sandboxes: { enabled: true, rolloutPercent: 1, overrides: {} },
    })
    assert.equal(state.available, true)
  })

  test('a zero rollout excludes every subject', () => {
    for (let i = 0; i < 50; i++) {
      const state = resolveFlag(
        'sandboxes',
        undefined,
        session(undefined, `org-${i}`),
        config({ enabled: true, rolloutPercent: 0 })
      )
      assert.equal(state.available, false)
    }
  })

  test('a full rollout includes every subject', () => {
    for (let i = 0; i < 50; i++) {
      const state = resolveFlag(
        'sandboxes',
        undefined,
        session(undefined, `org-${i}`),
        config({ enabled: true, rolloutPercent: 100 })
      )
      assert.equal(state.available, true)
    }
  })

  test('a partial rollout is stable across calls', () => {
    const snapshot = config({ enabled: true, rolloutPercent: 50 })
    const first = [...Array(100)].map(
      (_, i) =>
        resolveFlag(
          'sandboxes',
          undefined,
          session(undefined, `org-${i}`),
          snapshot
        ).available
    )
    const second = [...Array(100)].map(
      (_, i) =>
        resolveFlag(
          'sandboxes',
          undefined,
          session(undefined, `org-${i}`),
          snapshot
        ).available
    )
    assert.deepEqual(first, second)
    assert.ok(first.some(Boolean) && first.some((v) => !v))
  })
})

describe('resolveFlag capability', () => {
  test('no anyOf means no capability constraint', () => {
    const state = resolveFlag('sandboxes', undefined, session([]), config())
    assert.equal(state.capable, true)
  })

  test('anyOf is OR, not AND', () => {
    const state = resolveFlag(
      'sandboxes',
      ['admin:sandboxes', 'billing:manage'],
      session(['billing:manage']),
      config()
    )
    assert.equal(state.capable, true)
  })

  test('a session holding none is not capable', () => {
    const state = resolveFlag(
      'sandboxes',
      ['admin:sandboxes'],
      session(['billing:manage']),
      config()
    )
    assert.equal(state.capable, false)
  })

  test('an unavailable flag can still be capable — the two are independent', () => {
    const state = resolveFlag(
      'sandboxes',
      ['admin:sandboxes'],
      session(['admin:sandboxes']),
      config()
    )
    assert.deepEqual(state, { available: false, capable: true })
  })
})

describe('resolveFlagForClient', () => {
  test('show is the AND of both halves', () => {
    const held = session(['admin:sandboxes'], 'org-1')
    assert.equal(
      resolveFlagForClient('sandboxes', ['admin:sandboxes'], held, config())
        .show,
      false
    )
    assert.equal(
      resolveFlagForClient(
        'sandboxes',
        ['admin:sandboxes'],
        held,
        config({ enabled: true })
      ).show,
      true
    )
  })
})
