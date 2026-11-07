import assert from 'node:assert/strict'
import { afterEach, describe, mock, test } from 'node:test'
import { getInitialInspectorState } from '@pikku/inspector'
import type { InspectorState } from '@pikku/inspector'
import { pikkuMetaContext } from './meta.js'

type Capabilities = { mcp: boolean; agent: boolean }

const capabilitiesOf = async (state: InspectorState): Promise<Capabilities> => {
  const log = mock.method(console, 'log', () => {})
  await pikkuMetaContext.func(
    { getInspectorState: async () => state, config: {} } as any,
    {} as any
  )
  const printed = log.mock.calls[0]?.arguments[0] as string
  return JSON.parse(printed).capabilities
}

const emptyState = () => getInitialInspectorState('/project')

// The entries only need to exist: capabilities count them, and never read them.
const entry = {} as never

describe('pikku meta context capabilities', () => {
  afterEach(() => mock.restoreAll())

  test('an app with neither agents nor MCP reports neither', async () => {
    const { mcp, agent } = await capabilitiesOf(emptyState())
    assert.equal(mcp, false)
    assert.equal(agent, false)
  })

  test('an app with an agent reports the agent capability', async () => {
    const state = emptyState()
    state.agents.agentsMeta['support'] = entry
    const { mcp, agent } = await capabilitiesOf(state)
    assert.equal(agent, true)
    assert.equal(mcp, false)
  })

  for (const kind of ['toolsMeta', 'resourcesMeta', 'promptsMeta'] as const) {
    test(`an app with only ${kind} entries reports the mcp capability`, async () => {
      const state = emptyState()
      state.mcpEndpoints[kind]['search'] = entry
      const { mcp, agent } = await capabilitiesOf(state)
      assert.equal(mcp, true)
      assert.equal(agent, false)
    })
  }
})
