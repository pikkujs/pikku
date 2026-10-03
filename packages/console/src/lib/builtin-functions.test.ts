import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  filterFunctions,
  isBuiltInFunction,
  isPikkuFunction,
  isScenarioFunction,
} from './builtin-functions.js'

const appFunction = {
  pikkuFuncId: 'getConcept',
  funcWrapper: 'pikkuFunc',
  description: 'Reads one concept',
}
const pikkusOwn = {
  pikkuFuncId: 'analyticsIngest',
  funcWrapper: 'pikkuSessionlessFunc',
  tags: ['pikku', 'analytics'],
}
const scenario = {
  pikkuFuncId: 'conceptMapScenario',
  funcWrapper: 'pikkuScenario',
  scenario: true,
}
const scenarioStep = {
  pikkuFuncId: 'opensTheMap',
  funcWrapper: 'pikkuScenarioStep',
  scenarioStep: true,
}

describe('isPikkuFunction', () => {
  test("is pikku's own when the scaffold tagged it so", () => {
    assert.equal(isPikkuFunction(pikkusOwn), true)
  })

  test("is the app's when it carries no pikku tag", () => {
    assert.equal(isPikkuFunction(appFunction), false)
    assert.equal(
      isPikkuFunction({ ...appFunction, tags: ['analytics'] }),
      false
    )
  })
})

describe('isScenarioFunction', () => {
  test('reads the scenario and scenario-step markers off the meta', () => {
    assert.equal(isScenarioFunction(scenario), true)
    assert.equal(isScenarioFunction(scenarioStep), true)
  })

  test('leaves an ordinary function alone', () => {
    assert.equal(isScenarioFunction(appFunction), false)
    assert.equal(isScenarioFunction(pikkusOwn), false)
  })
})

describe('isBuiltInFunction', () => {
  test("covers pikku's own functions and the scenario suite", () => {
    assert.equal(isBuiltInFunction(pikkusOwn), true)
    assert.equal(isBuiltInFunction(scenario), true)
    assert.equal(isBuiltInFunction(scenarioStep), true)
  })

  test('is false only for what the app itself can do', () => {
    assert.equal(isBuiltInFunction(appFunction), false)
  })
})

describe('filterFunctions', () => {
  const all = [appFunction, pikkusOwn, scenario, scenarioStep]

  test('lists only the app’s own functions by default', () => {
    assert.deepEqual(filterFunctions(all, '', false), [appFunction])
  })

  test('lists everything once built-ins are shown', () => {
    assert.deepEqual(filterFunctions(all, '', true), all)
  })

  test('searches id, english name and description', () => {
    assert.deepEqual(filterFunctions(all, 'get concept', true), [appFunction])
    assert.deepEqual(filterFunctions(all, 'reads one', true), [appFunction])
    assert.deepEqual(filterFunctions(all, 'OPENSTHE', true), [scenarioStep])
  })

  test('does not reach a built-in through search while they are hidden', () => {
    assert.deepEqual(filterFunctions(all, 'scenario', false), [])
  })

  test('treats missing meta as no functions', () => {
    assert.deepEqual(filterFunctions(undefined, '', true), [])
  })
})
