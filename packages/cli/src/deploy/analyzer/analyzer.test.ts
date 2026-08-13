import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeDeployment, toSafeKebab } from './analyzer.js'
import type { InspectorState } from '@pikku/inspector'

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
})

describe('analyzeDeployment - agent identifier', () => {
  // Regression: the manifest agent `name` must be the registry KEY (export
  // name) — the identifier used by routes, addAIAgent(...), and the inspector
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
