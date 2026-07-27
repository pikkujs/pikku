import { test } from 'node:test'
import assert from 'node:assert'
import { convertDslToGraph } from './convert-dsl-to-graph.js'
import type { WorkflowsMeta } from '@pikku/core'

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
