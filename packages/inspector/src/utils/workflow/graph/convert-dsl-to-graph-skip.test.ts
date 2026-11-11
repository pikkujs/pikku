import { test } from 'node:test'
import assert from 'node:assert'
import { convertDslToGraph } from './convert-dsl-to-graph.js'
import type { WorkflowsMeta } from '@pikku/core/workflow'

const scenarioMeta = (
  overrides: Partial<WorkflowsMeta[string]> = {}
): WorkflowsMeta[string] => ({
  pikkuFuncId: 'installAddonFreshNameScenario',
  name: 'installAddonFreshNameScenario',
  scenario: true,
  steps: [],
  ...overrides,
})

test('convertDslToGraph: a scenario carries its skip reason into the graph', () => {
  const graph = convertDslToGraph(
    'installAddonFreshNameScenario',
    scenarioMeta({ skip: 'npm cannot install inside this yarn workspace' })
  )

  assert.strictEqual(
    graph.skip,
    'npm cannot install inside this yarn workspace'
  )
})

test('convertDslToGraph: a scenario with no skip leaves it unset', () => {
  const graph = convertDslToGraph(
    'installAddonFreshNameScenario',
    scenarioMeta()
  )

  assert.strictEqual(graph.skip, undefined)
})

test('convertDslToGraph: a scenario is flagged scenario: true', () => {
  const graph = convertDslToGraph(
    'installAddonFreshNameScenario',
    scenarioMeta()
  )

  assert.strictEqual(graph.source, 'scenario')
  assert.strictEqual(graph.scenario, true)
})

test('convertDslToGraph: a real workflow carries no scenario flag', () => {
  const graph = convertDslToGraph(
    'orderWorkflow',
    scenarioMeta({ scenario: undefined, dsl: true })
  )

  assert.strictEqual(graph.source, 'dsl')
  assert.strictEqual(graph.scenario, undefined)
})
