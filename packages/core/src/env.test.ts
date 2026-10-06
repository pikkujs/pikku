import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { isProduction, readEnvVariable } from './env.js'
import { pikkuState, resetPikkuState } from './pikku-state.js'
import { LocalVariablesService } from './services/local-variables.js'

const originalNodeEnv = process.env.NODE_ENV
const realProcess = globalThis.process

const registerVariables = (variables: unknown) =>
  pikkuState(null, 'package', 'singletonServices', { variables } as any)

/** Runs `fn` with `globalThis.process` removed, as on an edge runtime. */
const withoutProcess = <T>(fn: () => T): T => {
  delete (globalThis as any).process
  try {
    return fn()
  } finally {
    globalThis.process = realProcess
  }
}

beforeEach(() => resetPikkuState())

afterEach(() => {
  globalThis.process = realProcess
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  resetPikkuState()
})

describe('isProduction on Node', () => {
  test('follows NODE_ENV when services are unregistered', () => {
    process.env.NODE_ENV = 'production'
    assert.equal(isProduction(), true)
    process.env.NODE_ENV = 'development'
    assert.equal(isProduction(), false)
  })

  test('is not production when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV
    assert.equal(isProduction(), false)
  })

  test('process.env wins over a registered variables service', () => {
    process.env.NODE_ENV = 'development'
    registerVariables(new LocalVariablesService({ NODE_ENV: 'production' }))
    assert.equal(isProduction(), false)
  })

  test('a registered variables service answers when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV
    registerVariables(new LocalVariablesService({ NODE_ENV: 'production' }))
    assert.equal(isProduction(), true)
  })

  test('falls through to process.env when the service has no value', () => {
    process.env.NODE_ENV = 'production'
    registerVariables(new LocalVariablesService({}))
    assert.equal(isProduction(), true)
  })

  test('ignores a Promise from an async variables service', async () => {
    process.env.NODE_ENV = 'development'
    registerVariables({ get: async () => 'production' })
    assert.equal(isProduction(), false)
    process.env.NODE_ENV = 'production'
    registerVariables({ get: () => Promise.reject(new Error('down')) })
    assert.equal(isProduction(), true)
    await new Promise((resolve) => setImmediate(resolve))
  })

  test('a throwing variables service falls through', () => {
    process.env.NODE_ENV = 'production'
    registerVariables({
      get: () => {
        throw new Error('boom')
      },
    })
    assert.equal(isProduction(), true)
  })
})

describe('isProduction without process', () => {
  test('fails closed when nothing can say', () => {
    assert.equal(
      withoutProcess(() => isProduction()),
      true
    )
  })

  test('uses the registered variables service', () => {
    registerVariables(new LocalVariablesService({ NODE_ENV: 'development' }))
    assert.equal(
      withoutProcess(() => isProduction()),
      false
    )
    registerVariables(new LocalVariablesService({ NODE_ENV: 'production' }))
    assert.equal(
      withoutProcess(() => isProduction()),
      true
    )
  })

  test('is production when the service does not know NODE_ENV', () => {
    registerVariables(new LocalVariablesService({}))
    assert.equal(
      withoutProcess(() => isProduction()),
      true
    )
  })
})

describe('readEnvVariable', () => {
  test('reads from services, then process.env, then undefined', () => {
    process.env.PIKKU_TEST_ENV_A = 'from-process'
    try {
      assert.equal(readEnvVariable('PIKKU_TEST_ENV_A'), 'from-process')
      registerVariables(
        new LocalVariablesService({ PIKKU_TEST_ENV_A: 'from-service' })
      )
      assert.equal(readEnvVariable('PIKKU_TEST_ENV_A'), 'from-service')
      assert.equal(readEnvVariable('PIKKU_TEST_ENV_MISSING'), undefined)
    } finally {
      delete process.env.PIKKU_TEST_ENV_A
    }
  })

  test('returns undefined without process or services', () => {
    process.env.PIKKU_TEST_ENV_A = 'from-process'
    try {
      assert.equal(
        withoutProcess(() => readEnvVariable('PIKKU_TEST_ENV_A')),
        undefined
      )
    } finally {
      delete process.env.PIKKU_TEST_ENV_A
    }
  })
})

describe('LocalVariablesService default store', () => {
  test('defaults to process.env', () => {
    process.env.PIKKU_TEST_ENV_B = 'x'
    try {
      assert.equal(new LocalVariablesService().get('PIKKU_TEST_ENV_B'), 'x')
    } finally {
      delete process.env.PIKKU_TEST_ENV_B
    }
  })

  test('is an empty store when there is no process', () => {
    const service = withoutProcess(() => new LocalVariablesService())
    assert.equal(service.get('PATH'), undefined)
    service.set('A', 'b')
    assert.equal(service.get('A'), 'b')
  })
})
