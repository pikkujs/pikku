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

describe('collectFilterNames - addon units', () => {
  const addonUnit = (): DeploymentUnit => ({
    name: 'addon-console',
    role: 'function',
    target: 'serverless',
    functionIds: ['console:runSecurityAudit'],
    services: [],
    dependsOn: [],
    handlers: [
      {
        type: 'fetch',
        routes: [
          {
            method: 'post',
            route: '/rpc/console:runSecurityAudit',
            pikkuFuncId: 'console:runSecurityAudit',
          },
          {
            method: 'post',
            route: '/remote/rpc/console:runSecurityAudit',
            pikkuFuncId: 'console:runSecurityAudit',
          },
        ],
      },
    ],
    tags: [],
  })

  const names = () =>
    collectFilterNames(addonUnit(), manifestWithAgent(), inspectorState, true)

  test('the addon function id joins the filter', () => {
    assert.ok(names().includes('console:runSecurityAudit'))
  })

  test('the RPC catch-all scaffold joins the filter', () => {
    assert.ok(names().includes('rpcCaller'))
    assert.ok(names().includes('/rpc/:rpcName'))
  })

  test('the remote RPC scaffold joins the filter', () => {
    assert.ok(names().includes('remoteRPCHandler'))
    assert.ok(names().includes('/remote/rpc/:rpcName'))
  })
})

describe('collectFilterNames - the channel a CLI program is served over', () => {
  const cliManifest = (): DeploymentManifest =>
    ({
      agents: [],
      channels: [
        {
          name: 'seminarhof-cli',
          route: '/cli',
          unitName: 'channel-seminarhof-cli',
          functionIds: ['cliHelp', 'cliRaw', 'getEventsListing'],
        },
      ],
      mcpEndpoints: [],
      workflows: [],
      units: [],
    }) as unknown as DeploymentManifest

  const cliChannelUnit = (tags: string[]): DeploymentUnit => ({
    name: 'channel-seminarhof-cli',
    role: 'channel',
    target: 'serverless',
    functionIds: [],
    services: [],
    dependsOn: [],
    handlers: [{ type: 'fetch', routes: [] }],
    tags,
  })

  const cliState = {
    functions: { meta: {} },
    cli: {
      meta: {
        programs: {
          seminarhof: {
            program: 'seminarhof',
            commands: {
              events: { pikkuFuncId: 'getEventsListing' },
              availability: { pikkuFuncId: 'getAvailability' },
            },
          },
        },
      },
    },
  } as unknown as InspectorState

  const names = (unit: DeploymentUnit) =>
    collectFilterNames(unit, cliManifest(), cliState, true)

  test("the program's commands join the filter", () => {
    // CLI programs are filtered by command name, so without these the program
    // is emptied, dropped, and `__help`/`__raw` report "Program not found".
    const collected = names(cliChannelUnit(['cli', 'seminarhof']))
    assert.ok(collected.includes('events'))
    assert.ok(collected.includes('availability'))
  })

  test('the program name joins the filter', () => {
    assert.ok(names(cliChannelUnit(['cli', 'seminarhof'])).includes('seminarhof'))
  })

  test('the channel and its own wirings are still there', () => {
    const collected = names(cliChannelUnit(['cli', 'seminarhof']))
    for (const name of [
      'seminarhof-cli',
      'cliHelp',
      'cliRaw',
      'getEventsListing',
    ]) {
      assert.ok(collected.includes(name), `expected ${name}`)
    }
  })

  test('a channel that serves no CLI program is unchanged', () => {
    assert.deepEqual(names(cliChannelUnit(['websocket'])).sort(), [
      'cliHelp',
      'cliRaw',
      'getEventsListing',
      'seminarhof-cli',
    ])
  })

  test('a cli tag naming no known program adds nothing', () => {
    assert.ok(!names(cliChannelUnit(['cli', 'ghost'])).includes('ghost'))
  })
})
