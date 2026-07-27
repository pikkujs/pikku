import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  partitionScenarioFunctions,
  partitionScenarioFunctionsMeta,
  partitionScenarioWorkflows,
} from './scenario-partition.js'

const fn = (name: string) => [
  name,
  { path: `/src/${name}.ts`, exportedName: name },
]

const functionsMeta = {
  createTodo: { pikkuFuncId: 'createTodo' },
  opensPage: { pikkuFuncId: 'opensPage', scenarioStep: true },
  seesText: { pikkuFuncId: 'seesText', scenarioStep: true },
} as any

describe('partitioning scenario steps out of the app surface', () => {
  test('a scenario step never lands in the app function registrations', () => {
    const files = new Map([
      fn('createTodo'),
      fn('opensPage'),
      fn('seesText'),
    ] as any)

    const { app, scenario } = partitionScenarioFunctions(
      files as any,
      functionsMeta
    )

    assert.deepEqual([...app.keys()], ['createTodo'])
    assert.deepEqual([...scenario.keys()].sort(), ['opensPage', 'seesText'])
  })

  test('a function with no meta stays on the app side', () => {
    const files = new Map([fn('unknownFunc')] as any)
    const { app, scenario } = partitionScenarioFunctions(
      files as any,
      functionsMeta
    )
    assert.deepEqual([...app.keys()], ['unknownFunc'])
    assert.equal(scenario.size, 0)
  })

  test('the function meta splits the same way the registrations do', () => {
    const { app, scenario } = partitionScenarioFunctionsMeta(functionsMeta)
    assert.deepEqual(Object.keys(app), ['createTodo'])
    assert.deepEqual(Object.keys(scenario).sort(), ['opensPage', 'seesText'])
  })
})

describe('partitioning scenarios out of the app workflows', () => {
  const graphMeta = {
    orderWorkflow: { name: 'orderWorkflow', source: 'dsl' },
    codeEditorScenario: { name: 'codeEditorScenario', source: 'scenario' },
  } as any

  test('only a workflow whose source is scenario moves', () => {
    const files = new Map([
      fn('orderWorkflow'),
      fn('codeEditorScenario'),
    ] as any)

    const { appNames, scenarioNames, appFiles, scenarioFiles } =
      partitionScenarioWorkflows(
        ['orderWorkflow', 'codeEditorScenario'],
        files as any,
        graphMeta
      )

    assert.deepEqual(appNames, ['orderWorkflow'])
    assert.deepEqual(scenarioNames, ['codeEditorScenario'])
    assert.deepEqual([...appFiles.keys()], ['orderWorkflow'])
    assert.deepEqual([...scenarioFiles.keys()], ['codeEditorScenario'])
  })

  test('a workflow with no graph meta stays on the app side', () => {
    const { appNames, scenarioNames } = partitionScenarioWorkflows(
      ['dslOnlyWorkflow'],
      new Map() as any,
      graphMeta
    )
    assert.deepEqual(appNames, ['dslOnlyWorkflow'])
    assert.deepEqual(scenarioNames, [])
  })
})
