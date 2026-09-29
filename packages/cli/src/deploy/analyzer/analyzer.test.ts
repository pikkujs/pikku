import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeDeployment as analyzeUnpinned,
  toSafeKebab,
  unroutedHttpWirings,
} from './analyzer.js'
import type { InspectorState } from '@pikku/inspector'

/**
 * These tests assert on unit names, and under the default `'services'` strategy
 * a unit is named for the services its functions build rather than for the
 * function itself. They are about what the analyzer puts IN a unit, not about
 * how units are partitioned, so they pin the one-unit-per-function layout they
 * were written against. Partitioning is covered in grouping.test.ts.
 */
const analyzeDeployment: typeof analyzeUnpinned = (state, options) =>
  analyzeUnpinned(state, { grouping: { strategy: 'function' }, ...options })

/**
 * Minimal InspectorState carrying a single AI agent whose registry key
 * (export name) differs from its human-facing `name`. Only the buckets
 * `analyzeDeployment` dereferences are populated.
 */
function stateWithAgent(agentKey: string, humanName: string): InspectorState {
  return {
    functions: { meta: {} },
    http: { meta: {} },
    agents: {
      agentsMeta: {
        [agentKey]: {
          name: humanName,
          model: 'deepseek/deepseek-v4-flash',
          tools: [],
          tags: [],
        },
      },
    },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    workflows: { graphMeta: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
  } as unknown as InspectorState
}

/**
 * A project whose scenarios live under `srcDirectories` — one application
 * function wired to HTTP, one scenario made of one step.
 */
function stateWithScenario(): InspectorState {
  return {
    functions: {
      meta: {
        createTodo: { pikkuFuncId: 'createTodo', name: 'createTodo' },
        opensPage: {
          pikkuFuncId: 'opensPage',
          name: 'opensPage',
          scenarioStep: true,
          expose: true,
        },
        loginScenario: {
          pikkuFuncId: 'loginScenario',
          name: 'loginScenario',
          scenario: true,
        },
      },
    },
    http: {
      meta: {
        post: {
          '/todo': {
            pikkuFuncId: 'createTodo',
            method: 'post',
            route: '/todo',
          },
        },
      },
    },
    agents: { agentsMeta: {} },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    workflows: {
      graphMeta: {
        loginScenario: {
          name: 'loginScenario',
          pikkuFuncId: 'loginScenario',
          source: 'scenario',
          nodes: {
            'step-1': { rpcName: 'opensPage', stepName: 'opens the page' },
          },
          entryNodeIds: ['step-1'],
        },
      },
    },
    secrets: { definitions: [] },
    variables: { definitions: [] },
  } as unknown as InspectorState
}

describe('analyzeDeployment - scenarios are not deployable', () => {
  // A pikkuScenario IS a workflow and a step IS a function, so before this the
  // analyzer treated a test suite as application code: a unit per scenario and
  // per step, a WorkflowDefinition per scenario, and a real
  // `wf-orchestrator-<scenario>` queue that the provider would then create in
  // production. One project ended up with 13 of them.
  test('no unit, workflow, or queue is created for a scenario or its steps', () => {
    const manifest = analyzeDeployment(stateWithScenario(), {
      projectId: 'test',
    })

    assert.deepEqual(
      manifest.units.map((u) => u.name),
      ['create-todo']
    )
    assert.deepEqual(manifest.workflows, [])
    assert.deepEqual(manifest.queues, [])
  })

  test('a scenario wired as an MCP tool reaches neither the gateway nor its dependencies', () => {
    // The MCP metas are keyed by wiring, so they are the one place a scenario id
    // can still arrive from raw state after the function and workflow filters. A
    // gateway listing one would depend on a unit that was never emitted.
    const state = stateWithScenario()
    ;(state as any).mcpEndpoints = {
      toolsMeta: {
        loginScenario: { pikkuFuncId: 'loginScenario', name: 'loginScenario' },
      },
      resourcesMeta: {
        opensPage: { pikkuFuncId: 'opensPage', name: 'opensPage' },
      },
      promptsMeta: {},
    }

    const manifest = analyzeDeployment(state, { projectId: 'test' })

    assert.deepEqual(manifest.mcpEndpoints, [])
    assert.equal(
      manifest.units.some((u) => u.role === 'mcp'),
      false
    )
    assert.deepEqual(
      manifest.units.flatMap((u) => u.dependsOn ?? []),
      []
    )
  })

  test('an application MCP tool still gets its gateway alongside a scenario', () => {
    const state = stateWithScenario()
    ;(state as any).mcpEndpoints = {
      toolsMeta: {
        createTodo: { pikkuFuncId: 'createTodo', name: 'createTodo' },
        loginScenario: { pikkuFuncId: 'loginScenario', name: 'loginScenario' },
      },
      resourcesMeta: {},
      promptsMeta: {},
    }

    const manifest = analyzeDeployment(state, { projectId: 'test' })

    assert.deepEqual(manifest.mcpEndpoints, [
      {
        unitName: 'mcp-server',
        toolFunctionIds: ['createTodo'],
        resourceFunctionIds: [],
        promptFunctionIds: [],
      },
    ])
    assert.deepEqual(manifest.units.find((u) => u.role === 'mcp')?.dependsOn, [
      'create-todo',
    ])
  })

  /**
   * A project with two plain functions and nothing else, so an MCP test can say
   * which endpoint each tool lands on without a scenario filter in the way.
   */
  function stateWithTools(): InspectorState {
    return {
      functions: {
        meta: {
          createTodo: { pikkuFuncId: 'createTodo', name: 'createTodo' },
          forecast: { pikkuFuncId: 'forecast', name: 'forecast' },
        },
      },
      http: { meta: {} },
      agents: { agentsMeta: {} },
      mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
      channels: { meta: {} },
      queueWorkers: { meta: {} },
      scheduledTasks: { meta: {} },
      workflows: { graphMeta: {} },
      secrets: { definitions: [] },
      variables: { definitions: [] },
    } as unknown as InspectorState
  }

  test('a tool naming a surface gets an endpoint of its own', () => {
    // This is what lets one project expose several connectors: a client pointed
    // at a surface must list that surface's tools and no others, so a surfaced
    // tool has to leave the shared endpoint, not be copied onto both.
    const state = stateWithTools()
    ;(state as any).mcpEndpoints = {
      toolsMeta: {
        createTodo: { pikkuFuncId: 'createTodo', name: 'createTodo' },
        forecast: {
          pikkuFuncId: 'forecast',
          name: 'weather:forecast',
          surface: 'weather',
        },
      },
      resourcesMeta: {},
      promptsMeta: {},
      surfaces: { weather: '/mcp/weather' },
    }

    const manifest = analyzeDeployment(state, { projectId: 'test' })

    assert.deepEqual(
      manifest.mcpEndpoints.map((e) => [e.unitName, e.toolFunctionIds]),
      [
        ['mcp-weather', ['forecast']],
        ['mcp-server', ['createTodo']],
      ]
    )

    const weather = manifest.units.find((u) => u.name === 'mcp-weather')
    assert.equal(weather?.role, 'mcp')
    assert.deepEqual(weather?.dependsOn, ['forecast'])
  })

  test('a surface endpoint is routable on its own path', () => {
    const state = stateWithTools()
    ;(state as any).mcpEndpoints = {
      toolsMeta: {
        forecast: {
          pikkuFuncId: 'forecast',
          name: 'weather:forecast',
          surface: 'weather',
        },
      },
      resourcesMeta: {},
      promptsMeta: {},
      surfaces: { weather: '/connectors/weather' },
    }

    const manifest = analyzeDeployment(state, { projectId: 'test' })
    const unit = manifest.units.find((u) => u.name === 'mcp-weather')
    const routes = (unit?.handlers ?? []).flatMap((handler) =>
      handler.type === 'fetch' ? handler.routes : []
    )

    assert.deepEqual(
      routes.map((r) => `${r.method} ${r.route}`),
      [
        'post /connectors/weather',
        'get /connectors/weather',
        'delete /connectors/weather',
        'get /.well-known/oauth-protected-resource/connectors/weather',
      ]
    )
  })

  // The bare discovery route describes no endpoint in particular, so giving it
  // to every unit registers the same route twice and lets the provider's router
  // pick which resource a client is told about.
  test('only the default endpoint claims the path-less discovery route', () => {
    const state = stateWithTools()
    ;(state as any).mcpEndpoints = {
      toolsMeta: {
        createTodo: { pikkuFuncId: 'createTodo', name: 'createTodo' },
        forecast: {
          pikkuFuncId: 'forecast',
          name: 'weather:forecast',
          surface: 'weather',
        },
      },
      resourcesMeta: {},
      promptsMeta: {},
      surfaces: { weather: '/mcp/weather' },
    }

    const manifest = analyzeDeployment(state, { projectId: 'test' })
    const claimants = manifest.units
      .filter((unit) =>
        (unit.handlers ?? []).some(
          (handler) =>
            handler.type === 'fetch' &&
            handler.routes.some(
              (route) => route.route === '/.well-known/oauth-protected-resource'
            )
        )
      )
      .map((unit) => unit.name)

    assert.deepEqual(claimants, ['mcp-server'])
  })

  test('surfacing every tool leaves no default endpoint behind', () => {
    const state = stateWithTools()
    ;(state as any).mcpEndpoints = {
      toolsMeta: {
        forecast: {
          pikkuFuncId: 'forecast',
          name: 'weather:forecast',
          surface: 'weather',
        },
      },
      resourcesMeta: {},
      promptsMeta: {},
      surfaces: { weather: '/mcp/weather' },
    }

    const manifest = analyzeDeployment(state, { projectId: 'test' })

    assert.deepEqual(
      manifest.units.filter((u) => u.role === 'mcp').map((u) => u.name),
      ['mcp-weather']
    )
  })

  // An MCP unit with an empty route table deploys and then never receives a
  // request: the provider builds its routing from exactly this list.
  test('the MCP gateway is routable', () => {
    const state = stateWithScenario()
    ;(state as any).mcpEndpoints = {
      toolsMeta: {
        createTodo: { pikkuFuncId: 'createTodo', name: 'createTodo' },
      },
      resourcesMeta: {},
      promptsMeta: {},
    }

    const manifest = analyzeDeployment(state, { projectId: 'test' })
    const mcpUnit = manifest.units.find((u) => u.role === 'mcp')
    const routes = (mcpUnit?.handlers ?? []).flatMap((handler) =>
      handler.type === 'fetch' ? handler.routes : []
    )

    assert.deepEqual(
      routes.map((r) => `${r.method} ${r.route}`),
      [
        'post /mcp',
        'get /mcp',
        'delete /mcp',
        'get /.well-known/oauth-protected-resource',
        'get /.well-known/oauth-protected-resource/mcp',
      ]
    )
  })

  test('an exposed step gets no /rpc route', () => {
    const manifest = analyzeDeployment(stateWithScenario(), {
      projectId: 'test',
    })
    const routes = manifest.units.flatMap((u) =>
      u.handlers.flatMap((h) => (h.type === 'fetch' ? h.routes : []))
    )
    assert.equal(
      routes.some((r) => r.route.includes('opensPage')),
      false
    )
  })
})

describe('toSafeKebab', () => {
  test('converts camelCase to kebab-case', () => {
    assert.equal(toSafeKebab('myFunction'), 'my-function')
    assert.equal(toSafeKebab('createUser'), 'create-user')
  })

  test('converts PascalCase to kebab-case', () => {
    assert.equal(toSafeKebab('CreateUser'), 'create-user')
    assert.equal(toSafeKebab('HTTPServer'), 'http-server')
  })

  test('sanitizes colons', () => {
    assert.equal(
      toSafeKebab('workflowStart:myWorkflow'),
      'workflow-start-my-workflow'
    )
    assert.equal(
      toSafeKebab('http:options:/rpc/:rpcName'),
      'http-options-rpc-rpc-name'
    )
  })

  test('sanitizes slashes', () => {
    assert.equal(toSafeKebab('http:get:/todos/:id'), 'http-get-todos-id')
  })

  test('collapses consecutive dashes', () => {
    assert.equal(toSafeKebab('a::b'), 'a-b')
    assert.equal(toSafeKebab('a://b'), 'a-b')
  })

  test('strips leading and trailing dashes', () => {
    assert.equal(toSafeKebab(':leadingColon'), 'leading-colon')
    assert.equal(toSafeKebab('/leadingSlash'), 'leading-slash')
  })

  test('handles already kebab-case', () => {
    assert.equal(toSafeKebab('my-function'), 'my-function')
  })

  test('handles graph function IDs', () => {
    assert.equal(
      toSafeKebab('graphStart:todoReviewWorkflow:fetchOverdue'),
      'graph-start-todo-review-workflow-fetch-overdue'
    )
  })
})

/**
 * A project wiring two instances of addon packages: one scoped to the secrets
 * it declared, one handed the whole `SecretService` by the app.
 */
function stateWithWiredAddons(): InspectorState {
  return {
    functions: { meta: {} },
    http: { meta: {} },
    agents: { agentsMeta: {} },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    workflows: { graphMeta: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
    rpc: {
      wireAddonDeclarations: new Map([
        ['slack', { package: '@addon/slack' }],
        [
          'console',
          {
            package: '@pikku/addon-console',
            globalSecrets: 'administers secrets an operator names at runtime',
            globalCredentials: 'links credentials an operator names at runtime',
          },
        ],
        [
          'graph',
          {
            package: '@pikku/addon-graph',
            secretGrants: ['STRIPE_KEY', 'GITHUB_TOKEN'],
            credentialGrants: ['slack'],
            secretOverrides: { MAILGUN_KEY: 'PROD_EMAIL_KEY' },
          },
        ],
      ]),
    },
  } as unknown as InspectorState
}

describe('analyzeDeployment - unscoped addon secrets', () => {
  // An addon holding the whole SecretService is the one place the "an addon
  // only reads what it declared" rule is waived, so a deployment has to be able
  // to see it — and the app's stated reason — without reading source.
  test('only an addon granted globalSecrets is reported, with its reason', () => {
    const manifest = analyzeDeployment(stateWithWiredAddons(), {
      projectId: 'test',
    })

    assert.deepEqual(manifest.unscopedSecretAddons, [
      {
        namespace: 'console',
        package: '@pikku/addon-console',
        reason: 'administers secrets an operator names at runtime',
      },
    ])
  })

  test('a credential exemption is reported separately from a secret one', () => {
    const manifest = analyzeDeployment(stateWithWiredAddons(), {
      projectId: 'test',
    })

    assert.deepEqual(manifest.unscopedCredentialAddons, [
      {
        namespace: 'console',
        package: '@pikku/addon-console',
        reason: 'links credentials an operator names at runtime',
      },
    ])
  })

  test('a project with no addons reports none', () => {
    const manifest = analyzeDeployment(stateWithAgent('a', 'a'), {
      projectId: 'test',
    })

    assert.deepEqual(manifest.unscopedSecretAddons, [])
    assert.deepEqual(manifest.unscopedCredentialAddons, [])
  })

  // A grant is the other half of the same waiver: the app lending an addon a
  // secret it never declared. Enumerating only `globalSecrets` would leave a
  // deployment blind to it.
  test('the secrets an app lends an addon are reported with their names', () => {
    const manifest = analyzeDeployment(stateWithWiredAddons(), {
      projectId: 'test',
    })

    assert.deepEqual(manifest.grantedSecretAddons, [
      {
        namespace: 'graph',
        package: '@pikku/addon-graph',
        granted: ['GITHUB_TOKEN', 'MAILGUN_KEY', 'STRIPE_KEY'],
      },
    ])
  })

  test('a lent credential is reported separately from a lent secret', () => {
    const manifest = analyzeDeployment(stateWithWiredAddons(), {
      projectId: 'test',
    })

    assert.deepEqual(manifest.grantedCredentialAddons, [
      {
        namespace: 'graph',
        package: '@pikku/addon-graph',
        granted: ['slack'],
      },
    ])
  })

  test('an addon holding the whole service is not also reported as granted', () => {
    const manifest = analyzeDeployment(stateWithWiredAddons(), {
      projectId: 'test',
    })

    assert.ok(
      !manifest.grantedSecretAddons.some((a) => a.namespace === 'console'),
      'globalSecrets already reports it, and it grants no named set'
    )
  })

  test('a project with no grants reports none', () => {
    const manifest = analyzeDeployment(stateWithAgent('a', 'a'), {
      projectId: 'test',
    })

    assert.deepEqual(manifest.grantedSecretAddons, [])
    assert.deepEqual(manifest.grantedCredentialAddons, [])
  })
})

describe('analyzeDeployment - agent identifier', () => {
  // Regression: the manifest agent `name` must be the registry KEY (export
  // name) — the identifier used by routes, addAgent(...), and the inspector
  // name filter — NOT the human-facing `agentMeta.name`. Per-unit codegen
  // feeds `agentDef.name` to `--names`; if it's the human name the filter
  // prunes the agent and its registration never gets bundled, producing a
  // runtime "AI agent not found: <key>".
  test('uses the registry key, not the human-facing name', () => {
    const manifest = analyzeDeployment(
      stateWithAgent('kanbanAgent', 'kanban-agent'),
      { projectId: 'test' }
    )

    assert.equal(manifest.agents.length, 1)
    assert.equal(manifest.agents[0].name, 'kanbanAgent')
    assert.notEqual(manifest.agents[0].name, 'kanban-agent')
    // unitName is kebab of the key and must round-trip to the agent route
    assert.equal(manifest.agents[0].unitName, 'agent-kanban-agent')
  })
})

function stateWithExposedFunctionAndAgent(): InspectorState {
  return {
    functions: {
      meta: {
        getMe: { pikkuFuncId: 'getMe', name: 'getMe', expose: true },
      },
    },
    http: { meta: {} },
    agents: {
      agentsMeta: {
        helper: { name: 'helper', model: 'x', tools: [], tags: [] },
      },
    },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    workflows: { graphMeta: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
  } as unknown as InspectorState
}

const routesOf = (
  manifest: ReturnType<typeof analyzeDeployment>,
  unit: string
) =>
  (manifest.units.find((u) => u.name === unit)?.handlers ?? [])
    .flatMap((h) => ('routes' in h ? h.routes : []))
    .map((r) => r.route)

describe('analyzeDeployment - globalHTTPPrefix', () => {
  test('prefixes the synthesized RPC route', () => {
    const manifest = analyzeDeployment(stateWithExposedFunctionAndAgent(), {
      projectId: 'test',
      globalHTTPPrefix: '/api',
    })
    assert.deepEqual(routesOf(manifest, 'get-me'), ['/api/rpc/getMe'])
  })

  test('prefixes the synthesized agent routes', () => {
    const manifest = analyzeDeployment(stateWithExposedFunctionAndAgent(), {
      projectId: 'test',
      globalHTTPPrefix: '/api',
    })
    assert.deepEqual(routesOf(manifest, 'agent-helper'), [
      '/api/rpc/agent/helper',
      '/api/rpc/agent/helper/stream',
      '/api/rpc/agent/helper/approve',
      '/api/rpc/agent/helper/resume',
    ])
  })

  test('a trailing slash on the prefix does not double up', () => {
    const manifest = analyzeDeployment(stateWithExposedFunctionAndAgent(), {
      projectId: 'test',
      globalHTTPPrefix: '/api/',
    })
    assert.deepEqual(routesOf(manifest, 'get-me'), ['/api/rpc/getMe'])
  })

  test('no prefix leaves the routes as they were', () => {
    const manifest = analyzeDeployment(stateWithExposedFunctionAndAgent(), {
      projectId: 'test',
    })
    assert.deepEqual(routesOf(manifest, 'get-me'), ['/rpc/getMe'])
  })
})

/**
 * A function wired to HTTP whose body calls `runAgent('houseAssistant', ...)`,
 * alongside the agent that call names.
 */
function stateWithFunctionInvokingAgent(
  invoked: string[] = ['houseAssistant']
): InspectorState {
  return {
    functions: {
      meta: {
        askTheHouse: {
          pikkuFuncId: 'askTheHouse',
          name: 'askTheHouse',
          services: { services: ['kysely'] },
        },
      },
      files: new Map([
        [
          'askTheHouse',
          {
            path: '/project/src/assistant/ask-the-house.function.ts',
            exportedName: 'askTheHouse',
          },
        ],
      ]),
    },
    http: {
      meta: {
        post: {
          '/ask': {
            pikkuFuncId: 'askTheHouse',
            method: 'post',
            route: '/ask',
          },
        },
      },
    },
    agents: {
      agentsMeta: {
        houseAssistant: {
          name: 'house-assistant',
          model: 'deepseek/deepseek-v4-flash',
          tools: ['listChores'],
          tags: [],
        },
      },
      invokedAgentsByFile: new Map([
        ['/project/src/assistant/ask-the-house.function.ts', new Set(invoked)],
      ]),
    },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    workflows: { graphMeta: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
  } as unknown as InspectorState
}

describe('analyzeDeployment - agents invoked from a function body', () => {
  // `runAgent(...)` resolves against the in-process registry, so the calling
  // unit has to register the agent itself — the agent gateway unit is a
  // different worker.
  const unitOf = (state: InspectorState) =>
    analyzeDeployment(state, { projectId: 'test' }).units.find(
      (u) => u.name === 'ask-the-house'
    )!

  test('the calling unit records the agent', () => {
    assert.deepEqual(unitOf(stateWithFunctionInvokingAgent()).invokedAgents, [
      'houseAssistant',
    ])
  })

  test('the calling unit gains the AI service requirements', () => {
    const capabilities = unitOf(stateWithFunctionInvokingAgent()).services.map(
      (s) => s.capability
    )
    assert.ok(capabilities.includes('ai-model'))
    assert.ok(capabilities.includes('ai-storage'))
  })

  test("the function's own services survive", () => {
    const capabilities = unitOf(stateWithFunctionInvokingAgent()).services.map(
      (s) => s.capability
    )
    assert.ok(capabilities.includes('database'))
  })

  test('a name that is not a declared agent is ignored', () => {
    const unit = unitOf(stateWithFunctionInvokingAgent(['notAnAgent']))
    assert.equal(unit.invokedAgents, undefined)
    assert.ok(!unit.services.some((s) => s.capability === 'ai-model'))
  })
})

/**
 * A project with the remote-job inbox generated by `scaffold.remoteJobs`, one
 * queue worker and one scheduled task. `emails` needs a serverless-incompatible
 * service so the two workers resolve to different targets.
 */
function stateWithRemoteJobInbox(): InspectorState {
  return {
    functions: {
      meta: {
        runRemoteQueueJob: {
          pikkuFuncId: 'runRemoteQueueJob',
          name: 'runRemoteQueueJob',
        },
        runRemoteScheduledJob: {
          pikkuFuncId: 'runRemoteScheduledJob',
          name: 'runRemoteScheduledJob',
        },
        sendEmail: {
          pikkuFuncId: 'sendEmail',
          name: 'sendEmail',
          services: { services: ['fileStore', 'kysely'] },
        },
        nightlyReport: { pikkuFuncId: 'nightlyReport', name: 'nightlyReport' },
      },
    },
    http: {
      meta: {
        post: {
          '/__pikku/queue-job': {
            pikkuFuncId: 'runRemoteQueueJob',
            method: 'post',
            route: '/__pikku/queue-job',
          },
          '/__pikku/scheduler-job': {
            pikkuFuncId: 'runRemoteScheduledJob',
            method: 'post',
            route: '/__pikku/scheduler-job',
          },
        },
      },
    },
    agents: { agentsMeta: {} },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: {
      meta: { emails: { name: 'emails', pikkuFuncId: 'sendEmail' } },
    },
    scheduledTasks: {
      meta: {
        nightly: {
          name: 'nightly',
          schedule: '0 3 * * *',
          pikkuFuncId: 'nightlyReport',
        },
      },
    },
    workflows: { graphMeta: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
  } as unknown as InspectorState
}

describe('analyzeDeployment - the remote job inbox lands on the work', () => {
  const analyze = () =>
    analyzeDeployment(stateWithRemoteJobInbox(), {
      projectId: 'test',
      serverlessIncompatible: ['fileStore'],
    })

  test('the queue inbox bundles the workers it dispatches to', () => {
    const unit = analyze().units.find((u) => u.name === 'run-remote-queue-job')
    assert.ok(unit)
    assert.deepEqual(unit.functionIds.sort(), [
      'runRemoteQueueJob',
      'sendEmail',
    ])
  })

  test('the scheduler inbox bundles the tasks it dispatches to', () => {
    const unit = analyze().units.find(
      (u) => u.name === 'run-remote-scheduled-job'
    )
    assert.ok(unit)
    assert.deepEqual(unit.functionIds.sort(), [
      'nightlyReport',
      'runRemoteScheduledJob',
    ])
  })

  test('a server-target worker pulls its inbox to server', () => {
    const unit = analyze().units.find((u) => u.name === 'run-remote-queue-job')
    assert.equal(unit?.target, 'server')
  })

  test('an inbox over serverless-only work stays serverless', () => {
    const unit = analyze().units.find(
      (u) => u.name === 'run-remote-scheduled-job'
    )
    assert.equal(unit?.target, 'serverless')
  })

  test('the inbox inherits the services its workers need', () => {
    const unit = analyze().units.find((u) => u.name === 'run-remote-queue-job')
    assert.ok(unit?.services.some((s) => s.capability === 'database'))
  })
})

/**
 * A project with the generic `/rpc/:rpcName` dispatcher, one ordinary
 * function, and one wired addon publishing an exposed and a non-exposed
 * function.
 */
function stateWithAddon(): InspectorState {
  return {
    functions: {
      meta: {
        rpcCaller: { pikkuFuncId: 'rpcCaller', name: 'rpcCaller' },
        createTodo: { pikkuFuncId: 'createTodo', name: 'createTodo' },
      },
    },
    http: {
      meta: {
        post: {
          '/rpc/:rpcName': {
            pikkuFuncId: 'rpcCaller',
            method: 'post',
            route: '/rpc/:rpcName',
          },
          '/todo': {
            pikkuFuncId: 'createTodo',
            method: 'post',
            route: '/todo',
          },
        },
      },
    },
    addonFunctions: {
      admin: {
        createUser: {
          pikkuFuncId: 'admin:createUser',
          name: 'createUser',
          expose: true,
        },
        internalSweep: {
          pikkuFuncId: 'admin:internalSweep',
          name: 'internalSweep',
        },
      },
    },
    agents: { agentsMeta: {} },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    workflows: { graphMeta: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
  } as unknown as InspectorState
}

describe('analyzeDeployment - addon units', () => {
  // Before this, no unit owned an addon's functions: the dispatcher kept every
  // wired addon's declaration and bundled the addon's whole package bootstrap,
  // node-only modules included. The addon now gets its own unit and the
  // dispatcher reaches it over a service binding.
  const analyze = (state = stateWithAddon()) =>
    analyzeDeployment(state, { projectId: 'test' })

  test('an addon namespace gets one unit', () => {
    const unit = analyze().units.find((u) => u.name === 'addon-admin')
    assert.ok(unit)
    assert.equal(unit.role, 'function')
  })

  test('the unit holds only the exposed functions', () => {
    const unit = analyze().units.find((u) => u.name === 'addon-admin')
    assert.deepEqual(unit?.functionIds, ['admin:createUser'])
  })

  test('a namespace with nothing exposed gets no unit', () => {
    const state = stateWithAddon()
    delete (state as any).addonFunctions.admin.createUser
    assert.equal(
      analyze(state).units.some((u) => u.name === 'addon-admin'),
      false
    )
  })

  const withWiredExpose = (expose: boolean | string[]) => {
    const state = stateWithAddon()
    ;(state as any).rpc = {
      wireAddonDeclarations: new Map([
        ['admin', { package: '@x/admin', expose }],
      ]),
    }
    return analyze(state)
  }

  test('a wireAddon expose list decides the unit, undeclared functions included', () => {
    const unit = withWiredExpose(['internalSweep']).units.find(
      (u) => u.name === 'addon-admin'
    )
    assert.deepEqual(unit?.functionIds, ['admin:internalSweep'])
  })

  test('wireAddon expose: false leaves the addon without a unit or a dispatch', () => {
    const { units } = withWiredExpose(false)
    assert.equal(
      units.some((u) => u.name === 'addon-admin'),
      false
    )
    const dispatcher = units.find((u) => u.name === 'rpc-caller')
    assert.equal(dispatcher?.dispatch?.['admin:createUser'], undefined)
  })

  test('the unit serves the rpc route for each exposed function', () => {
    const unit = analyze().units.find((u) => u.name === 'addon-admin')
    const routes = unit?.handlers
      .flatMap((h) => (h.type === 'fetch' ? h.routes : []))
      .map((r) => r.route)
    assert.deepEqual(routes, [
      '/rpc/admin:createUser',
      '/remote/rpc/admin:createUser',
    ])
  })

  test('the dispatcher routes the addon rpc to that unit', () => {
    const unit = analyze().units.find((u) => u.name === 'rpc-caller')
    assert.equal(unit?.dispatch?.['admin:createUser'], 'addon-admin')
  })

  test('the dispatcher depends on the addon unit', () => {
    const unit = analyze().units.find((u) => u.name === 'rpc-caller')
    assert.ok(unit?.dependsOn.includes('addon-admin'))
  })

  test('a unit that does not serve the catch-all gets no dispatch', () => {
    const unit = analyze().units.find((u) => u.name === 'create-todo')
    assert.equal(unit?.dispatch, undefined)
    assert.deepEqual(unit?.dependsOn, [])
  })

  test('an addon needing a serverless-incompatible service lands on server', () => {
    const state = stateWithAddon()
    ;(state as any).addonFunctions.admin.createUser.services = {
      services: ['fileStore'],
    }
    ;(state as any).addonServerlessIncompatible = new Map([
      ['admin', ['fileStore']],
    ])
    const unit = analyze(state).units.find((u) => u.name === 'addon-admin')
    assert.equal(unit?.target, 'server')
  })

  test('an addon on serverless-safe services stays serverless', () => {
    const unit = analyze().units.find((u) => u.name === 'addon-admin')
    assert.equal(unit?.target, 'serverless')
  })
})

/**
 * A project with one grouping rule per predicate kind, one function forced off
 * serverless by a service, and one function left to the fallback — so a single
 * fixture covers every way a unit can end up where it is.
 */
function stateWithRules(): InspectorState {
  return {
    functions: {
      meta: {
        renderInvoice: {
          pikkuFuncId: 'renderInvoice',
          name: 'renderInvoice',
          services: { services: ['pdfService'] },
        },
        listTodos: { pikkuFuncId: 'listTodos', name: 'listTodos' },
      },
    },
    http: {
      meta: {
        post: {
          '/api/invoices/:id/pdf': {
            pikkuFuncId: 'renderInvoice',
            method: 'post',
            route: '/api/invoices/:id/pdf',
          },
          '/todo': {
            pikkuFuncId: 'listTodos',
            method: 'post',
            route: '/todo',
          },
        },
      },
    },
    addonFunctions: {
      admin: {
        createUser: {
          pikkuFuncId: 'admin:createUser',
          name: 'createUser',
          expose: true,
        },
      },
    },
    agents: { agentsMeta: {} },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    workflows: { graphMeta: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
  } as unknown as InspectorState
}

describe('analyzeDeployment - a unit records why it is where it is', () => {
  const pdfRule = { unit: 'pdf', routes: ['/api/invoices/*'] }
  const consoleRule = { unit: 'console', addon: 'admin' }

  const analyze = (state = stateWithRules()) =>
    analyzeDeployment(state, {
      serverlessIncompatible: ['pdfService'],
      grouping: { strategy: 'function', rules: [pdfRule, consoleRule] },
    })

  const unit = (name: string, state?: InspectorState) =>
    analyze(state).units.find((u) => u.name === name)

  test('a unit matched by a rule names that rule', () => {
    assert.deepEqual(unit('pdf')?.groupedBy, pdfRule)
  })

  test('an addon unit matched by a rule names that rule', () => {
    assert.deepEqual(unit('console')?.groupedBy, consoleRule)
  })

  test('a unit left to the fallback names no rule', () => {
    assert.equal(unit('list-todos')?.groupedBy, undefined)
  })

  test('a unit crossed to server names the services that crossed it', () => {
    assert.equal(unit('pdf')?.target, 'server')
    assert.deepEqual(unit('pdf')?.targetForcedBy, ['pdfService'])
  })

  test('a unit that was not crossed names no service', () => {
    assert.equal(unit('list-todos')?.target, 'serverless')
    assert.equal(unit('list-todos')?.targetForcedBy, undefined)
  })

  test('a unit on the default target alone names no service', () => {
    const plain = analyzeDeployment(stateWithRules(), {}).units.find(
      (u) => u.name === 'render-invoice'
    )
    assert.equal(plain?.target, 'serverless')
    assert.equal(plain?.targetForcedBy, undefined)
  })

  test('a unit holding two crossed functions unions their services', () => {
    const state = stateWithRules()
    ;(state as any).functions.meta.renderStatement = {
      pikkuFuncId: 'renderStatement',
      name: 'renderStatement',
      services: { services: ['ghostscript'] },
    }
    ;(state as any).http.meta.post['/api/invoices/:id/statement'] = {
      pikkuFuncId: 'renderStatement',
      method: 'post',
      route: '/api/invoices/:id/statement',
    }
    const merged = analyzeDeployment(state, {
      serverlessIncompatible: ['pdfService', 'ghostscript'],
      grouping: { strategy: 'function', rules: [pdfRule, consoleRule] },
    }).units.find((u) => u.name === 'pdf')
    assert.deepEqual(merged?.targetForcedBy, ['pdfService', 'ghostscript'])
  })
})

describe('analyzeDeployment - workflow orchestrator target', () => {
  function stateWithWorkflow(): InspectorState {
    const state = stateWithScenario() as any
    state.functions.meta.sendEmail = {
      pikkuFuncId: 'sendEmail',
      name: 'sendEmail',
    }
    state.workflows.graphMeta = {
      onboard: {
        name: 'onboard',
        pikkuFuncId: 'onboard',
        nodes: { 'step-1': { rpcName: 'sendEmail', stepName: 'send' } },
        entryNodeIds: ['step-1'],
      },
    }
    return state
  }

  const orchestrator = (defaultTarget?: 'serverless' | 'server') =>
    analyzeDeployment(stateWithWorkflow(), {
      projectId: 'test',
      defaultTarget,
    }).units.find((u) => u.name === 'wf-onboard')

  test('inherits deploy.defaultTarget', () => {
    assert.equal(orchestrator('server')?.target, 'server')
  })

  test('stays serverless by default', () => {
    assert.equal(orchestrator()?.target, 'serverless')
  })
})

/**
 * `rpc.startWorkflow('onboard')` resolves onboard's meta in the calling
 * process. A unit whose function starts it, but which is not onboard's
 * orchestrator, needs that meta — or the deployed call fails with
 * WorkflowNotFoundError.
 */
describe('analyzeDeployment - rpc.startWorkflow from a function body', () => {
  function stateWithStarter(starter: Record<string, unknown> = {}) {
    const state = stateWithScenario() as any
    state.functions.meta.createTodo = {
      ...state.functions.meta.createTodo,
      services: { services: ['kysely'] },
      startsWorkflows: ['onboard', 'notAWorkflow'],
      ...starter,
    }
    state.functions.meta.sendEmail = {
      pikkuFuncId: 'sendEmail',
      name: 'sendEmail',
    }
    state.workflows.graphMeta = {
      onboard: {
        name: 'onboard',
        pikkuFuncId: 'onboard',
        nodes: { 'step-1': { rpcName: 'sendEmail', stepName: 'send' } },
        entryNodeIds: ['step-1'],
      },
    }
    return state as InspectorState
  }

  const starterUnit = (state: InspectorState, workflowQueues?: boolean) =>
    analyzeUnpinned(state, { projectId: 'test', workflowQueues }).units.find(
      (u) => u.functionIds.includes('createTodo')
    )

  test('the starting unit records the workflows it starts, known ones only', () => {
    assert.deepEqual(starterUnit(stateWithStarter())?.startedWorkflows, [
      'onboard',
    ])
  })

  test('the starting unit gets the run store and the queue a start enqueues on', () => {
    const unit = starterUnit(stateWithStarter())
    assert.ok(unit?.services.some((s) => s.capability === 'workflow-state'))
    assert.ok(unit?.services.some((s) => s.capability === 'queue'))
  })

  test('no queue capability when the provider runs workflows without queues', () => {
    const unit = starterUnit(stateWithStarter(), false)
    assert.deepEqual(unit?.startedWorkflows, ['onboard'])
    assert.ok(!unit?.services.some((s) => s.capability === 'queue'))
  })

  test('a unit that already has workflow-state is left to bundle every workflow', () => {
    const unit = starterUnit(
      stateWithStarter({
        services: { services: ['kysely', 'workflowService'] },
      })
    )
    assert.equal(unit?.startedWorkflows, undefined)
  })

  test('a unit that starts nothing is unchanged', () => {
    const unit = starterUnit(stateWithStarter({ startsWorkflows: undefined }))
    assert.equal(unit?.startedWorkflows, undefined)
    assert.ok(!unit?.services.some((s) => s.capability === 'workflow-state'))
  })
})

/**
 * A project with both shapes of `http:<method>:<route>` id: an agent wired over
 * HTTP with an inline `func` (the route is the app's own, nobody else serves
 * it) and the OPTIONS preflight beside `rpcCaller`'s catch-all (a bridge whose
 * route a named function already owns).
 */
function stateWithInlineHttpFuncs(): InspectorState {
  return {
    functions: {
      meta: {
        rpcCaller: { pikkuFuncId: 'rpcCaller', name: 'rpcCaller' },
        'http:post:/agents/shop': {
          pikkuFuncId: 'http:post:/agents/shop',
          name: 'http:post:/agents/shop',
        },
        'http:options:/rpc/:rpcName': {
          pikkuFuncId: 'http:options:/rpc/:rpcName',
          name: 'http:options:/rpc/:rpcName',
        },
      },
    },
    http: {
      meta: {
        post: {
          '/rpc/:rpcName': {
            pikkuFuncId: 'rpcCaller',
            method: 'post',
            route: '/rpc/:rpcName',
          },
          '/agents/shop': {
            pikkuFuncId: 'http:post:/agents/shop',
            method: 'post',
            route: '/agents/shop',
          },
        },
        options: {
          '/rpc/:rpcName': {
            pikkuFuncId: 'http:options:/rpc/:rpcName',
            method: 'options',
            route: '/rpc/:rpcName',
          },
        },
      },
    },
    agents: { agentsMeta: {} },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    workflows: { graphMeta: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
  } as unknown as InspectorState
}

describe('analyzeDeployment - routes wired to an inline func', () => {
  const servedRoutes = () =>
    analyzeDeployment(stateWithInlineHttpFuncs(), { projectId: 'test' })
      .units.flatMap((u) =>
        u.handlers.flatMap((h) => (h.type === 'fetch' ? h.routes : []))
      )
      .map((r) => `${r.method} ${r.route}`)

  // `wireHTTP({ func: agent('shopAssistant') })` has no nameable func, so the
  // inspector ids it after its route. Skipping every such id dropped the route
  // from the plan entirely: deployed, active units and a 404 at the edge.
  test('an inline func on its own route still gets a unit', () => {
    assert.ok(servedRoutes().includes('POST /agents/shop'))
  })

  // The OPTIONS preflight beside `rpcCaller`'s catch-all gets no unit of its
  // own — it rides the unit of the function that owns the route, which is what
  // makes it reachable rather than merely not-duplicated.
  test('a bridge onto a route a named function owns rides that unit', () => {
    const manifest = analyzeDeployment(stateWithInlineHttpFuncs(), {
      projectId: 'test',
    })
    const rpcUnit = manifest.units.find((u) =>
      u.functionIds.includes('rpcCaller')
    )
    assert.ok(rpcUnit)
    const routes = rpcUnit.handlers
      .flatMap((h) => (h.type === 'fetch' ? h.routes : []))
      .map((r) => `${r.method} ${r.route}`)
    assert.deepEqual(routes.sort(), [
      'OPTIONS /rpc/:rpcName',
      'POST /rpc/:rpcName',
    ])
  })
})

describe('unroutedHttpWirings', () => {
  test('names a declared route that reached no unit', () => {
    const state = stateWithInlineHttpFuncs()
    const manifest = analyzeDeployment(state, { projectId: 'test' })
    assert.deepEqual(unroutedHttpWirings(state.http.meta, manifest.units), [])

    // The shape every dropped route had: declared, generated into the meta,
    // owned by nothing. Previously indistinguishable from a healthy build.
    assert.deepEqual(
      unroutedHttpWirings(state.http.meta, []).map((r) => r.route).sort(),
      ['/agents/shop', '/rpc/:rpcName', '/rpc/:rpcName']
    )
  })

  // `agentCaller`'s `/rpc/agent/:agentName` is re-emitted as one concrete route
  // per agent, so the parameterized declaration owning no unit is correct.
  test('ignores the scaffold callers the analyzer expands per agent', () => {
    const httpMeta = {
      post: {
        '/rpc/agent/:agentName': {
          pikkuFuncId: 'agentCaller',
          method: 'post',
          route: '/rpc/agent/:agentName',
        },
      },
    } as any
    assert.deepEqual(unroutedHttpWirings(httpMeta, []), [])
  })
})

function stateWithTwoFunctionsOnOnePath(): InspectorState {
  return {
    functions: {
      meta: {
        getItems: { pikkuFuncId: 'getItems', name: 'getItems' },
        postItems: { pikkuFuncId: 'postItems', name: 'postItems' },
        'http:options:/items': {
          pikkuFuncId: 'http:options:/items',
          name: 'http:options:/items',
        },
      },
    },
    http: {
      meta: {
        get: {
          '/items': { pikkuFuncId: 'getItems', method: 'get', route: '/items' },
        },
        post: {
          '/items': {
            pikkuFuncId: 'postItems',
            method: 'post',
            route: '/items',
          },
        },
        options: {
          '/items': {
            pikkuFuncId: 'http:options:/items',
            method: 'options',
            route: '/items',
          },
        },
      },
    },
    agents: { agentsMeta: {} },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    workflows: { graphMeta: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
  } as unknown as InspectorState
}

describe('analyzeDeployment - a synthetic bridge shared by two owners', () => {
  test('the bridge is attached to exactly one unit', () => {
    const manifest = analyzeDeployment(stateWithTwoFunctionsOnOnePath(), {
      projectId: 'test',
    })
    const bridges = manifest.units
      .flatMap((u) =>
        u.handlers.flatMap((h) => (h.type === 'fetch' ? h.routes : []))
      )
      .filter((r) => r.method === 'OPTIONS' && r.route === '/items')
    assert.equal(bridges.length, 1)
  })
})

describe('unroutedHttpWirings - ownership', () => {
  // Another function's route on the same method and path must not satisfy the
  // declaration: the declared handler would still be missing.
  test('a different pikkuFuncId on the same method and path does not count', () => {
    const httpMeta = {
      get: {
        '/mcp': {
          pikkuFuncId: 'declaredThing',
          method: 'get',
          route: '/mcp',
        },
      },
    } as any
    const units = [
      {
        name: 'u',
        handlers: [
          {
            type: 'fetch',
            routes: [
              { method: 'GET', route: '/mcp', pikkuFuncId: 'mcpGateway' },
            ],
          },
        ],
      },
    ] as any
    assert.deepEqual(
      unroutedHttpWirings(httpMeta, units).map((r) => r.pikkuFuncId),
      ['declaredThing']
    )
  })

  // The thread readers ride the gateway unit but declare no route of their own,
  // so a declared HTTP route onto one reaches nothing and must be reported.
  test('a declared route onto a thread reader is reported', () => {
    const httpMeta = {
      get: {
        '/threads': {
          pikkuFuncId: 'getAgentThreads',
          method: 'get',
          route: '/threads',
        },
      },
    } as any
    assert.deepEqual(
      unroutedHttpWirings(httpMeta, []).map((r) => r.route),
      ['/threads']
    )
  })
})
