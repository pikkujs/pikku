import { describe, test } from 'node:test'
import { strict as assert } from 'node:assert'
import { filterInspectorState } from './filter-inspector-state.js'
import { getInitialInspectorState } from '../initial-state.js'
import type { InspectorLogger } from '../types.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  critical: () => {},
  diagnostic: () => {},
} as unknown as InspectorLogger

const withAddons = () => {
  const state = getInitialInspectorState('/test/project')
  state.addonFunctions = {
    agent: {
      run: { tags: ['ai'] } as any,
      stop: { tags: [] } as any,
    },
    crm: {
      listContacts: { tags: [] } as any,
    },
  }
  return state
}

describe('a function-level filter selects an addon by namespace', () => {
  test('`agent:*` keeps every function of that addon and no other addon', () => {
    const used = filterInspectorState(
      withAddons(),
      { names: ['agent:*'] },
      logger
    ).serviceAggregation.usedFunctions
    assert.ok(used.has('agent:run'))
    assert.ok(used.has('agent:stop'))
    assert.ok(!used.has('crm:listContacts'))
  })

  test('an exact addon function name keeps only that function', () => {
    const used = filterInspectorState(
      withAddons(),
      { names: ['agent:run'] },
      logger
    ).serviceAggregation.usedFunctions
    assert.ok(used.has('agent:run'))
    assert.ok(!used.has('agent:stop'))
  })

  test('tags select addon functions too', () => {
    const used = filterInspectorState(withAddons(), { tags: ['ai'] }, logger)
      .serviceAggregation.usedFunctions
    assert.ok(used.has('agent:run'))
    assert.ok(!used.has('agent:stop'))
  })

  test('the original state is left unchanged', () => {
    const state = withAddons()
    filterInspectorState(state, { names: ['agent:*'] }, logger)
    assert.ok(!state.serviceAggregation.usedFunctions.has('agent:run'))
  })
})
