import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { PostHogFeatureFlagSource } from './posthog-feature-flag-source.js'

const respondWith = (body: unknown, ok = true, status = 200) =>
  (async () =>
    ({
      ok,
      status,
      json: async () => body,
    }) as Response) as unknown as typeof globalThis.fetch

const source = (body: unknown, extra = {}) =>
  new PostHogFeatureFlagSource({
    projectApiKey: 'phc_test',
    personalApiKey: 'phx_test',
    fetch: respondWith(body),
    ...extra,
  })

describe('PostHogFeatureFlagSource', () => {
  test('maps active and the catch-all rollout', async () => {
    const snapshot = await source({
      flags: [
        {
          key: 'sandboxes',
          active: true,
          filters: { groups: [{ properties: [], rollout_percentage: 25 }] },
        },
      ],
    }).snapshot()

    assert.deepEqual(snapshot['sandboxes'], {
      enabled: true,
      rolloutPercent: 25,
      overrides: {},
    })
  })

  test('a condition with no percentage is everyone', async () => {
    const snapshot = await source({
      flags: [{ key: 'sandboxes', active: true, filters: { groups: [{}] } }],
    }).snapshot()

    assert.equal(snapshot['sandboxes']?.rolloutPercent, 100)
  })

  test('takes the widest catch-all, because conditions OR', async () => {
    const snapshot = await source({
      flags: [
        {
          key: 'sandboxes',
          active: true,
          filters: {
            groups: [
              { properties: [], rollout_percentage: 10 },
              { properties: [], rollout_percentage: 60 },
            ],
          },
        },
      ],
    }).snapshot()

    assert.equal(snapshot['sandboxes']?.rolloutPercent, 60)
  })

  test('maps a group-key condition to overrides', async () => {
    const snapshot = await source({
      flags: [
        {
          key: 'sandboxes',
          active: true,
          filters: {
            aggregation_group_type_index: 0,
            groups: [
              {
                properties: [
                  {
                    key: '$group_key',
                    operator: 'exact',
                    value: ['org-1', 'org-2'],
                  },
                ],
                rollout_percentage: 100,
              },
            ],
          },
        },
      ],
    }).snapshot()

    assert.deepEqual(snapshot['sandboxes']?.overrides, {
      'org-1': true,
      'org-2': true,
    })
  })

  test('a targeted condition below 100% is not an override', async () => {
    const snapshot = await source({
      flags: [
        {
          key: 'sandboxes',
          active: true,
          filters: {
            aggregation_group_type_index: 0,
            groups: [
              {
                properties: [{ key: '$group_key', value: 'org-1' }],
                rollout_percentage: 50,
              },
            ],
          },
        },
      ],
    }).snapshot()

    assert.deepEqual(snapshot['sandboxes']?.overrides, { 'org-1': false })
  })

  test('leaves an unmapped property filter alone', async () => {
    const snapshot = await source({
      flags: [
        {
          key: 'sandboxes',
          active: true,
          filters: {
            groups: [
              {
                properties: [
                  {
                    key: 'email',
                    operator: 'icontains',
                    value: '@example.com',
                  },
                ],
                rollout_percentage: 100,
              },
            ],
          },
        },
      ],
    }).snapshot()

    assert.deepEqual(snapshot['sandboxes'], {
      enabled: true,
      rolloutPercent: null,
      overrides: {},
    })
  })

  test('a deleted flag is not in the snapshot', async () => {
    const snapshot = await source({
      flags: [{ key: 'sandboxes', active: true, deleted: true }],
    }).snapshot()
    assert.equal(snapshot['sandboxes'], undefined)
  })

  test('keyMap keys the snapshot by the pikku name', async () => {
    const snapshot = await source(
      { flags: [{ key: 'ph-sandboxes', active: true }] },
      { keyMap: { sandboxes: 'ph-sandboxes' } }
    ).snapshot()

    assert.equal(snapshot['sandboxes']?.enabled, true)
    assert.equal(snapshot['ph-sandboxes'], undefined)
  })

  test('a failed read falls back rather than throwing', async () => {
    const failing = new PostHogFeatureFlagSource({
      projectApiKey: 'phc_test',
      personalApiKey: 'phx_test',
      declared: [{ name: 'sandboxes' }],
      fetch: respondWith({}, false, 401),
    })

    assert.deepEqual(await failing.snapshot(), {
      sandboxes: { enabled: true, rolloutPercent: null, overrides: {} },
    })
  })
})
