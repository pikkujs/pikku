import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { serializeScenarioFunctions } from './serialize-scenario-functions.js'

describe('serializeScenarioFunctions', () => {
  test('emits the four scenario instrumentation functions, exposed', () => {
    const source = serializeScenarioFunctions('../pikku-types.gen.js', true)
    for (const name of [
      'pikkuScenarioTakeLiveCoverage',
      'pikkuScenarioResetLiveCoverage',
      'pikkuScenarioResetStubs',
      'pikkuScenarioGetStubCalls',
    ]) {
      assert.match(source, new RegExp(`export const ${name} = `))
    }
    assert.equal(source.match(/expose: true/g)?.length, 4)
  })

  test('imports runtime helpers from @pikku/core, never the console addon or the CLI', () => {
    const source = serializeScenarioFunctions('../pikku-types.gen.js', true)
    assert.match(source, /from '@pikku\/core\/services'/)
    assert.match(source, /coverageService\.takeReport/)
    assert.match(source, /getStubTracker/)
    assert.doesNotMatch(source, /console:/)
    assert.doesNotMatch(source, /wireAddon/)
    assert.doesNotMatch(source, /@pikku\/cli/)
    assert.doesNotMatch(source, /trace-mapping/)
  })

  test('auth flag follows the scaffold feature value', () => {
    const withAuth = serializeScenarioFunctions('../pikku-types.gen.js', true)
    assert.equal(withAuth.match(/auth: true/g)?.length, 4)
    assert.doesNotMatch(withAuth, /auth: false/)

    const noAuth = serializeScenarioFunctions('../pikku-types.gen.js', false)
    assert.equal(noAuth.match(/auth: false/g)?.length, 4)
    assert.doesNotMatch(noAuth, /auth: true/)
  })

  test('imports project types from the given path', () => {
    const source = serializeScenarioFunctions('../../types/pikku.gen.js', true)
    assert.match(source, /from '\.\.\/\.\.\/types\/pikku\.gen\.js'/)
  })
})
