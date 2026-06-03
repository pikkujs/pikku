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
