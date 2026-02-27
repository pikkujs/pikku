import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  pikkuState,
  resetPikkuState,
  initializePikkuState,
  getAllPackageStates,
  getSingletonServices,
  getCreateWireServices,
  getPikkuMetaDir,
  addPackageServiceFactories,
} from './pikku-state.js'

beforeEach(() => {
  resetPikkuState()
})

describe('pikkuState', () => {
  test('should get state for main package with null name', () => {
    const functions = pikkuState(null, 'function', 'functions')
    assert.ok(functions instanceof Map)
  })

  test('should get state for main package with __main__ name', () => {
    const functions = pikkuState('__main__', 'function', 'functions')
    assert.ok(functions instanceof Map)
  })

  test('should set and get state values', () => {
    const testMeta = { key: 'value' }
    pikkuState(null, 'function', 'meta', testMeta as any)
    const result = pikkuState(null, 'function', 'meta')
    assert.deepStrictEqual(result, testMeta)
  })

  test('should auto-initialize package state on first access', () => {
    const states = getAllPackageStates()
    assert.ok(!states.has('@test/package'))

    pikkuState('@test/package', 'function', 'functions')

    assert.ok(states.has('@test/package'))
  })

  test('should isolate state between packages', () => {
    pikkuState(null, 'function', 'meta', { main: true } as any)
    pikkuState('@addon/pkg', 'function', 'meta', { addon: true } as any)

    assert.deepStrictEqual(pikkuState(null, 'function', 'meta'), { main: true })
    assert.deepStrictEqual(pikkuState('@addon/pkg', 'function', 'meta'), {
      addon: true,
    })
  })

  test('should return correct state types', () => {
    const httpRoutes = pikkuState(null, 'http', 'routes')
    assert.ok(httpRoutes instanceof Map)

    const schemas = pikkuState(null, 'misc', 'schemas')
    assert.ok(schemas instanceof Map)

    const errors = pikkuState(null, 'misc', 'errors')
    assert.ok(errors instanceof Map)
  })
})

describe('getAllPackageStates', () => {
  test('should return a Map', () => {
    const states = getAllPackageStates()
    assert.ok(states instanceof Map)
  })

  test('should contain __main__ after reset', () => {
    const states = getAllPackageStates()
    assert.ok(states.has('__main__'))
  })

  test('should return same reference on multiple calls', () => {
    const states1 = getAllPackageStates()
    const states2 = getAllPackageStates()
    assert.strictEqual(states1, states2)
  })
})

describe('initializePikkuState', () => {
  test('should create a new package state', () => {
    const states = getAllPackageStates()
    assert.ok(!states.has('@new/package'))

    initializePikkuState('@new/package')

    assert.ok(states.has('@new/package'))
  })

  test('should not overwrite existing package state', () => {
    pikkuState('@existing/pkg', 'function', 'meta', { test: true } as any)

    initializePikkuState('@existing/pkg')

    const meta = pikkuState('@existing/pkg', 'function', 'meta')
    assert.deepStrictEqual(meta, { test: true })
  })
})

describe('resetPikkuState', () => {
  test('should clear all package states', () => {
    initializePikkuState('@addon/one')
    initializePikkuState('@addon/two')
    assert.ok(getAllPackageStates().has('@addon/one'))

    resetPikkuState()

    assert.ok(!getAllPackageStates().has('@addon/one'))
    assert.ok(!getAllPackageStates().has('@addon/two'))
  })

  test('should preserve errors map from __main__', () => {
    const errors = pikkuState(null, 'misc', 'errors')
    errors.set('TestError', { status: 400, message: 'test' })

    resetPikkuState()

    const restoredErrors = pikkuState(null, 'misc', 'errors')
    assert.strictEqual(restoredErrors.get('TestError')?.message, 'test')
  })

  test('should re-initialize __main__ package', () => {
    resetPikkuState()

    const states = getAllPackageStates()
    assert.ok(states.has('__main__'))
    assert.ok(pikkuState(null, 'function', 'functions') instanceof Map)
  })

  test('should create fresh state objects after reset', () => {
    const functionsBefore = pikkuState(null, 'function', 'functions')
    functionsBefore.set('testFunc', {} as any)

    resetPikkuState()

    const functionsAfter = pikkuState(null, 'function', 'functions')
    assert.strictEqual(functionsAfter.size, 0)
  })
})

describe('getSingletonServices', () => {
  test('should throw when singleton services not initialized', () => {
    assert.throws(() => getSingletonServices(), {
      message: 'Singleton services not initialized',
    })
  })

  test('should return services when initialized', () => {
    const mockServices = { logger: { info: () => {} } }
    pikkuState(null, 'package', 'singletonServices', mockServices as any)

    const result = getSingletonServices()
    assert.strictEqual(result, mockServices)
  })
})

describe('getCreateWireServices', () => {
  test('should return undefined when no factories set', () => {
    const result = getCreateWireServices()
    assert.strictEqual(result, undefined)
  })

  test('should return createWireServices when factories set', () => {
    const mockCreateWire = async () => ({})
    pikkuState(null, 'package', 'factories', {
      createWireServices: mockCreateWire,
    } as any)

    const result = getCreateWireServices()
    assert.strictEqual(result, mockCreateWire)
  })
})

describe('getPikkuMetaDir', () => {
  test('should return null by default', () => {
    const result = getPikkuMetaDir()
    assert.strictEqual(result, null)
  })

  test('should return metaDir when set', () => {
    pikkuState(null, 'package', 'metaDir', '/some/path' as any)
    const result = getPikkuMetaDir()
    assert.strictEqual(result, '/some/path')
  })

  test('should return metaDir for specific package', () => {
    pikkuState('@test/pkg', 'package', 'metaDir', '/addon/path' as any)
    const result = getPikkuMetaDir('@test/pkg')
    assert.strictEqual(result, '/addon/path')
  })

  test('should treat null packageName as main', () => {
    pikkuState(null, 'package', 'metaDir', '/main/path' as any)
    const result = getPikkuMetaDir(null)
    assert.strictEqual(result, '/main/path')
  })
})

describe('addPackageServiceFactories', () => {
  test('should register factories for addon package', () => {
    const mockFactories = {
      createSingletonServices: async () => ({}),
      createWireServices: async () => ({}),
    }

    addPackageServiceFactories('@addon/pkg', mockFactories as any)

    const result = pikkuState('@addon/pkg', 'package', 'factories')
    assert.strictEqual(result, mockFactories)
  })

  test('should not affect main package factories', () => {
    const addonFactories = { createSingletonServices: async () => ({}) }
    addPackageServiceFactories('@addon/pkg', addonFactories as any)

    const mainFactories = pikkuState(null, 'package', 'factories')
    assert.strictEqual(mainFactories, null)
  })
})
