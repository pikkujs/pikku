import assert from 'node:assert/strict'
import { describe, test, beforeEach } from 'node:test'
import { ErrorCode } from '../error-codes.js'
import { validateExposedFunctionsGated } from './validate-exposed-functions-gated.js'

const ADDON_PACKAGE = '@addon/console'

let diagnostics: Array<{ severity: string; code: string; message: string }>

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  critical: () => {},
  diagnostic: (d: any) => diagnostics.push(d),
  hasCriticalErrors: () => false,
} as any

/**
 * The two pieces of state the check reads: every function's meta, and every
 * wireAddon declaration the inspector found.
 */
const stateWith = (
  meta: Record<string, unknown>,
  addons: Record<string, unknown> = {}
) =>
  ({
    functions: { meta },
    rpc: { wireAddonDeclarations: new Map(Object.entries(addons)) },
  }) as any

/** An exposed sessionless function with no gate of any kind — the bad shape. */
const ungatedFunction = (overrides: Record<string, unknown> = {}) => ({
  pikkuFuncId: 'credentialGet',
  expose: true,
  sessionless: true,
  ...overrides,
})

const run = (state: any) => {
  validateExposedFunctionsGated(logger, state)
  return diagnostics
}

const warning = () => {
  const found = diagnostics.find(
    (d) => d.code === ErrorCode.EXPOSED_FUNCTION_HAS_NO_GATE
  )
  return found
}

beforeEach(() => {
  diagnostics = []
})

describe('validateExposedFunctionsGated', () => {
  test('warns about an exposed sessionless function with no gate', () => {
    run(stateWith({ credentialGet: ungatedFunction() }))

    const found = warning()
    assert.ok(found, 'expected a diagnostic')
    assert.equal(found.severity, 'warn')
    assert.match(found.message, /credentialGet/)
  })

  test('names every ungated function, not just a count', () => {
    run(
      stateWith({
        credentialGet: ungatedFunction(),
        installAddon: ungatedFunction({ pikkuFuncId: 'installAddon' }),
      })
    )

    assert.match(warning()!.message, /credentialGet/)
    assert.match(warning()!.message, /installAddon/)
  })

  test('stays silent for a function that is not exposed', () => {
    run(stateWith({ credentialGet: ungatedFunction({ expose: undefined }) }))

    assert.equal(warning(), undefined)
  })

  test('stays silent for a pikkuFunc, which always requires a session', () => {
    run(stateWith({ credentialGet: ungatedFunction({ sessionless: false }) }))

    assert.equal(warning(), undefined)
  })

  test('stays silent for a scenario step, which rpcExposed refuses anyway', () => {
    run(stateWith({ step: ungatedFunction({ scenarioStep: true }) }))

    assert.equal(warning(), undefined)
  })

  describe('a function that gates itself', () => {
    test('is silent when it declares auth', () => {
      run(stateWith({ credentialGet: ungatedFunction({ auth: true }) }))

      assert.equal(warning(), undefined)
    })

    test('is silent when it declares it authenticates in its own body', () => {
      // A webhook receiver verifying a signature has a real gate this check
      // cannot see. Without a way to say so the warning would fire forever on
      // functions that are fine, and a warning that is usually wrong is one
      // nobody reads.
      run(
        stateWith({
          stripeWebhook: ungatedFunction({ selfAuthenticated: true }),
        })
      )

      assert.equal(warning(), undefined)
    })

    test('still warns when the declaration is explicitly false', () => {
      run(
        stateWith({
          credentialGet: ungatedFunction({ selfAuthenticated: false }),
        })
      )

      assert.ok(warning())
    })

    test('is silent when it declares scopes', () => {
      run(stateWith({ credentialGet: ungatedFunction({ scopes: ['admin'] }) }))

      assert.equal(warning(), undefined)
    })

    test('is silent when it declares permissions', () => {
      run(
        stateWith({
          credentialGet: ungatedFunction({
            permissions: [{ type: 'wire', name: 'isAdmin' }],
          }),
        })
      )

      assert.equal(warning(), undefined)
    })

    test('still warns when scopes is present but empty', () => {
      run(stateWith({ credentialGet: ungatedFunction({ scopes: [] }) }))

      assert.ok(warning(), 'an empty scopes array gates nothing')
    })
  })

  describe('a function gated by its addon', () => {
    test('is silent when the addon declares scopes', () => {
      run(
        stateWith(
          {
            credentialGet: ungatedFunction({ packageName: ADDON_PACKAGE }),
          },
          { console: { package: ADDON_PACKAGE, scopes: ['admin'] } }
        )
      )

      assert.equal(warning(), undefined)
    })

    test('is silent when the addon declares auth', () => {
      run(
        stateWith(
          {
            credentialGet: ungatedFunction({ packageName: ADDON_PACKAGE }),
          },
          { console: { package: ADDON_PACKAGE, auth: true } }
        )
      )

      assert.equal(warning(), undefined)
    })

    test('warns when the addon is wired without any gate', () => {
      run(
        stateWith(
          {
            credentialGet: ungatedFunction({ packageName: ADDON_PACKAGE }),
          },
          { console: { package: ADDON_PACKAGE } }
        )
      )

      assert.ok(warning(), 'wireAddon with no scopes or auth gates nothing')
    })

    test('warns when the gated addon is a different package', () => {
      run(
        stateWith(
          {
            credentialGet: ungatedFunction({ packageName: ADDON_PACKAGE }),
          },
          { other: { package: '@addon/other', scopes: ['admin'] } }
        )
      )

      assert.ok(warning())
    })

    test('is silent when any one instance of the package is gated', () => {
      // resolveAddonScopes unions across every instance of the package, so a
      // second ungated namespace does not open the first.
      run(
        stateWith(
          {
            credentialGet: ungatedFunction({ packageName: ADDON_PACKAGE }),
          },
          {
            console: { package: ADDON_PACKAGE, scopes: ['admin'] },
            consoleReadonly: { package: ADDON_PACKAGE },
          }
        )
      )

      assert.equal(warning(), undefined)
    })
  })

  test('stays silent when nothing is exposed', () => {
    run(stateWith({}))

    assert.equal(diagnostics.length, 0)
  })
})
