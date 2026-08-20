import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { InspectorState } from '@pikku/inspector'

import { wiredSchemasOf } from './wired-schemas.js'

const emptyState = (): InspectorState =>
  ({
    agents: { agentsMeta: {} },
    channels: { meta: {} },
    scopes: { definitions: [] },
    workflows: { meta: {}, graphMeta: {} },
    serviceAggregation: { requiredServices: new Set<string>() },
  }) as unknown as InspectorState

describe('wiredSchemasOf', () => {
  test('a project that wires nothing implies no gated schema', () => {
    assert.deepEqual([...wiredSchemasOf(emptyState())], [])
  })

  test('each wiring implies its own schema and no other', () => {
    const cases: [Partial<InspectorState>, string][] = [
      [{ agents: { agentsMeta: { chat: {} } } } as any, 'agent'],
      [{ channels: { meta: { events: {} } } } as any, 'channel'],
      [{ scopes: { definitions: [{ name: 'admin' }] } } as any, 'scope'],
      [
        { workflows: { meta: { onboard: {} }, graphMeta: {} } } as any,
        'workflow',
      ],
    ]

    for (const [wiring, expected] of cases) {
      const wired = wiredSchemasOf({ ...emptyState(), ...wiring })
      assert.deepEqual([...wired], [expected])
    }
  })

  test('a graph on its own implies the workflow schema', () => {
    const state = emptyState()
    const wired = wiredSchemasOf({
      ...state,
      workflows: { ...state.workflows, graphMeta: { flow: {} } } as any,
    })
    assert.deepEqual([...wired], ['workflow'])
  })

  /**
   * Outbound webhook delivery is a service, not a wiring — nothing in a
   * project's source declares a webhook the way it declares a channel — so the
   * signal is a function asking for the service that writes those rows.
   */
  test('requiring the webhook service implies the webhook schema', () => {
    const wired = wiredSchemasOf({
      ...emptyState(),
      serviceAggregation: {
        requiredServices: new Set(['webhookService']),
      } as any,
    })
    assert.deepEqual([...wired], ['webhook'])
  })
})
