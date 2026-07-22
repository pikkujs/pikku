import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { serializeScenarioFunctions } from './serialize-scenario-functions.js'

describe('serializeScenarioFunctions', () => {
  test('emits the four scenario instrumentation functions, exposed', () => {
    const { functions } = serializeScenarioFunctions(
      '../pikku-types.gen.js',
      true
    )
    for (const name of [
      'pikkuScenarioTakeLiveCoverage',
      'pikkuScenarioResetLiveCoverage',
      'pikkuScenarioResetStubs',
      'pikkuScenarioGetStubCalls',
    ]) {
      assert.match(functions, new RegExp(`export const ${name} = `))
    }
    assert.equal(functions.match(/expose: true/g)?.length, 4)
  })

  test('imports runtime helpers from @pikku/core, never the console addon or the CLI', () => {
    const { functions } = serializeScenarioFunctions(
      '../pikku-types.gen.js',
      true
    )
    assert.match(functions, /from '@pikku\/core\/services'/)
    assert.match(functions, /coverageService\.takeReport/)
    assert.match(functions, /getStubTracker/)
    assert.doesNotMatch(functions, /console:/)
    assert.doesNotMatch(functions, /wireAddon/)
    assert.doesNotMatch(functions, /@pikku\/cli/)
    assert.doesNotMatch(functions, /trace-mapping/)
  })

  test('auth flag follows the scaffold feature value', () => {
    const withAuth = serializeScenarioFunctions(
      '../pikku-types.gen.js',
      true
    ).functions
    assert.equal(withAuth.match(/auth: true/g)?.length, 4)
    assert.doesNotMatch(withAuth, /auth: false/)

    const noAuth = serializeScenarioFunctions(
      '../pikku-types.gen.js',
      false
    ).functions
    assert.equal(noAuth.match(/auth: false/g)?.length, 4)
    assert.doesNotMatch(noAuth, /auth: true/)
  })

  test('imports project types from the given path', () => {
    const { functions } = serializeScenarioFunctions(
      '../../types/pikku.gen.js',
      true
    )
    assert.match(functions, /from '\.\.\/\.\.\/types\/pikku\.gen\.js'/)
  })

  test('takes payload schemas from the sibling zod module, never a generic', () => {
    const { schemas, functions } = serializeScenarioFunctions(
      '../pikku-types.gen.js',
      true
    )
    assert.match(schemas, /import \{ z \} from 'zod'/)
    assert.match(schemas, /export const StubCallsQuery = z\.object\(\{/)
    assert.match(functions, /from '\.\/scenarios\.schemas\.gen\.js'/)
    assert.match(functions, /input: StubCallsQuery/)
    assert.ok(
      !functions.includes('pikkuFunc<'),
      'schemas and generics are mutually exclusive'
    )
  })

  test('leaves the core-typed results without a zod output', () => {
    const { schemas, functions } = serializeScenarioFunctions(
      '../pikku-types.gen.js',
      true
    )
    assert.ok(
      !schemas.includes('FunctionCoverageReport') &&
        !/StubCall\b/.test(schemas),
      're-declaring a core type in zod would be a second definition free to drift'
    )
    assert.equal(
      functions.match(/output: /g)?.length,
      2,
      'only the two shapes the scaffold owns carry an output schema'
    )
  })

  test('keeps the schemas module free of anything but zod', () => {
    const { schemas } = serializeScenarioFunctions(
      '../pikku-types.gen.js',
      true
    )
    assert.ok(
      !schemas.includes('pikku-types.gen.js'),
      'the inspector imports this module directly, so it must not reach for a path deploy codegen rewrites'
    )
    assert.ok(!schemas.includes('@pikku/core'))
  })
})
