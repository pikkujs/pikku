import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { UnleashFeatureFlagSource } from './unleash-feature-flag-source.js'

const respondWith = (body: unknown, ok = true, status = 200) =>
  (async () =>
    ({
      ok,
      status,
      json: async () => body,
    }) as Response) as unknown as typeof globalThis.fetch

const source = (body: unknown, extra = {}) =>
  new UnleashFeatureFlagSource({
    url: 'https://unleash.example.com/',
    token: 'client-token',
    fetch: respondWith(body),
    ...extra,
  })

describe('UnleashFeatureFlagSource', () => {
  test('a feature with no strategies is its toggle', async () => {
    const snapshot = await source({
      features: [{ name: 'sandboxes', enabled: true }],
    }).snapshot()

    assert.deepEqual(snapshot['sandboxes'], {
      enabled: true,
      rolloutPercent: null,
      overrides: {},
    })
  })

  test('maps flexibleRollout to a percentage', async () => {
    const snapshot = await source({
      features: [
        {
          name: 'sandboxes',
          enabled: true,
          strategies: [
            { name: 'flexibleRollout', parameters: { rollout: '25' } },
          ],
        },
      ],
    }).snapshot()

    assert.equal(snapshot['sandboxes']?.rolloutPercent, 25)
  })

  test('maps userWithId to overrides', async () => {
    const snapshot = await source({
      features: [
        {
          name: 'sandboxes',
          enabled: true,
          strategies: [
            {
              name: 'userWithId',
              parameters: { userIds: 'org-1, org-2 ,org-3' },
            },
          ],
        },
      ],
    }).snapshot()

    assert.deepEqual(snapshot['sandboxes']?.overrides, {
      'org-1': true,
      'org-2': true,
      'org-3': true,
    })
  })

  test('takes the widest rollout, because strategies OR', async () => {
    const snapshot = await source({
      features: [
        {
          name: 'sandboxes',
          enabled: true,
          strategies: [
            { name: 'flexibleRollout', parameters: { rollout: '10' } },
            { name: 'gradualRolloutUserId', parameters: { percentage: '70' } },
          ],
        },
      ],
    }).snapshot()

    assert.equal(snapshot['sandboxes']?.rolloutPercent, 70)
  })

  test('the default strategy removes the rollout constraint', async () => {
    const snapshot = await source({
      features: [
        {
          name: 'sandboxes',
          enabled: true,
          strategies: [
            { name: 'flexibleRollout', parameters: { rollout: '10' } },
            { name: 'default' },
          ],
        },
      ],
    }).snapshot()

    assert.equal(snapshot['sandboxes']?.rolloutPercent, null)
  })

  test('an unmapped strategy is ignored, never guessed at', async () => {
    const snapshot = await source({
      features: [
        {
          name: 'sandboxes',
          enabled: true,
          strategies: [
            { name: 'remoteAddress', parameters: { IPs: '10.0.0.1' } },
          ],
        },
      ],
    }).snapshot()

    assert.deepEqual(snapshot['sandboxes'], {
      enabled: true,
      rolloutPercent: null,
      overrides: {},
    })
  })

  test('a disabled feature is off whatever its strategies say', async () => {
    const snapshot = await source({
      features: [
        {
          name: 'sandboxes',
          enabled: false,
          strategies: [{ name: 'default' }],
        },
      ],
    }).snapshot()

    assert.equal(snapshot['sandboxes']?.enabled, false)
  })

  test('keyMap keys the snapshot by the pikku name', async () => {
    const snapshot = await source(
      { features: [{ name: 'unleash-sandboxes', enabled: true }] },
      { keyMap: { sandboxes: 'unleash-sandboxes' } }
    ).snapshot()

    assert.equal(snapshot['sandboxes']?.enabled, true)
  })

  test('a failed read falls back rather than throwing', async () => {
    const failing = new UnleashFeatureFlagSource({
      url: 'https://unleash.example.com',
      token: 'client-token',
      declared: [{ name: 'sandboxes' }],
      fetch: respondWith({}, false, 401),
    })

    assert.deepEqual(await failing.snapshot(), {
      sandboxes: { enabled: true, rolloutPercent: null, overrides: {} },
    })
  })
})
