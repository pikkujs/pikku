import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { collectFilterNames } from './per-unit-codegen.js'
import type { InspectorState } from '@pikku/inspector'
import type { DeploymentManifest, DeploymentUnit } from '@pikku/deploy'

function manifestWithAgent(): DeploymentManifest {
  return {
    agents: [
      {
        name: 'houseAssistant',
        unitName: 'agent-house-assistant',
        toolFunctionIds: ['listChores'],
        subAgentNames: [],
        model: 'deepseek/deepseek-v4-flash',
      },
    ],
    channels: [],
    mcpEndpoints: [],
    workflows: [],
    units: [],
  } as unknown as DeploymentManifest
}

function callingUnit(invokedAgents?: string[]): DeploymentUnit {
  return {
    name: 'ask-the-house',
    role: 'function',
    target: 'serverless',
    functionIds: ['askTheHouse'],
    services: [],
    dependsOn: [],
    handlers: [{ type: 'fetch', routes: [] }],
    tags: [],
    ...(invokedAgents && { invokedAgents }),
  }
}

const inspectorState = {
  functions: { meta: { askTheHouse: { pikkuFuncId: 'askTheHouse' } } },
} as unknown as InspectorState

describe('collectFilterNames - agents invoked from a function body', () => {
  // Without the agent name in the filter, per-unit codegen emits no
  // `addAgent(...)` for this unit and the in-process lookup fails at run time
  // with "AI agent not found".
  const names = (unit: DeploymentUnit) =>
    collectFilterNames(unit, manifestWithAgent(), inspectorState, true)

  test('the agent name joins the filter', () => {
    assert.ok(names(callingUnit(['houseAssistant'])).includes('houseAssistant'))
  })

  test("the agent's tools join the filter", () => {
    assert.ok(names(callingUnit(['houseAssistant'])).includes('listChores'))
  })

  test('the RPC catch-all joins the filter, for tool dispatch', () => {
    assert.ok(names(callingUnit(['houseAssistant'])).includes('/rpc/:rpcName'))
  })

  test('a unit invoking no agent is unchanged', () => {
    assert.deepEqual(names(callingUnit()), ['askTheHouse'])
  })
})
