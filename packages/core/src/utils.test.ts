import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  closeWireServices,
  createWeakUID,
  isSerializable,
  getTagGroups,
  freezeDedupe,
  stopSingletonServices,
} from './utils.js'
import {
  resetPikkuState,
  pikkuState,
  initializePikkuState,
} from './pikku-state.js'

beforeEach(() => {
  resetPikkuState()
})

describe('createWeakUID', () => {
  test('should return a string', () => {
    const uid = createWeakUID()
    assert.strictEqual(typeof uid, 'string')
  })

  test('should return unique values', () => {
    const uid1 = createWeakUID()
    const uid2 = createWeakUID()
    assert.notStrictEqual(uid1, uid2)
  })

  test('should contain a dash separator', () => {
    const uid = createWeakUID()
    assert.ok(uid.includes('-'))
  })
})

describe('isSerializable', () => {
  test('should return true for objects', () => {
    assert.strictEqual(isSerializable({ key: 'value' }), true)
  })

  test('should return true for arrays', () => {
    assert.strictEqual(isSerializable([1, 2, 3]), true)
  })

  test('should return true for numbers', () => {
    assert.strictEqual(isSerializable(42), true)
  })

  test('should return true for booleans', () => {
    assert.strictEqual(isSerializable(true), true)
  })

  test('should return true for null', () => {
    assert.strictEqual(isSerializable(null), true)
  })

  test('should return false for strings', () => {
    assert.strictEqual(isSerializable('hello'), false)
  })

  test('should return false for ArrayBuffer', () => {
    assert.strictEqual(isSerializable(new ArrayBuffer(8)), false)
  })

  test('should return false for Uint8Array', () => {
    assert.strictEqual(isSerializable(new Uint8Array(8)), false)
  })

  test('should return false for Int8Array', () => {
    assert.strictEqual(isSerializable(new Int8Array(8)), false)
  })

  test('should return false for Uint16Array', () => {
    assert.strictEqual(isSerializable(new Uint16Array(8)), false)
  })

  test('should return false for Float64Array', () => {
    assert.strictEqual(isSerializable(new Float64Array(8)), false)
  })
})

describe('getTagGroups', () => {
  test('should return exact match', () => {
    const groups = { billing: 'billing-middleware' as any }
    const result = getTagGroups(groups, 'billing')
    assert.deepStrictEqual(result, ['billing-middleware'])
  })

  test('should return parent tag for namespaced tag', () => {
    const groups = { billing: 'billing-middleware' as any }
    const result = getTagGroups(groups, 'billing:read')
    assert.deepStrictEqual(result, ['billing-middleware'])
  })

  test('should return both exact and parent matches', () => {
    const groups = {
      billing: 'billing-middleware' as any,
      'billing:read': 'billing-read-middleware' as any,
    }
    const result = getTagGroups(groups, 'billing:read')
    assert.deepStrictEqual(result, [
      'billing-read-middleware',
      'billing-middleware',
    ])
  })

  test('should resolve multi-level namespace', () => {
    const groups = {
      billing: 'b' as any,
      'billing:read': 'br' as any,
      'billing:read:admin': 'bra' as any,
    }
    const result = getTagGroups(groups, 'billing:read:admin')
    assert.deepStrictEqual(result, ['bra', 'br', 'b'])
  })

  test('should return empty array for unmatched tag', () => {
    const groups = { billing: 'b' as any }
    const result = getTagGroups(groups, 'other')
    assert.deepStrictEqual(result, [])
  })

  test('should skip missing intermediate groups', () => {
    const groups = {
      billing: 'b' as any,
      // no billing:read
      'billing:read:admin': 'bra' as any,
    }
    const result = getTagGroups(groups, 'billing:read:admin')
    assert.deepStrictEqual(result, ['bra', 'b'])
  })
})

describe('freezeDedupe', () => {
  test('should return frozen empty array for undefined', () => {
    const result = freezeDedupe(undefined)
    assert.strictEqual(result.length, 0)
    assert.ok(Object.isFrozen(result))
  })

  test('should return frozen empty array for empty array', () => {
    const result = freezeDedupe([])
    assert.strictEqual(result.length, 0)
    assert.ok(Object.isFrozen(result))
  })

  test('should return same frozen reference for empty arrays', () => {
    const result1 = freezeDedupe([])
    const result2 = freezeDedupe(undefined)
    assert.strictEqual(result1, result2)
  })

  test('should return frozen single element array', () => {
    const result = freezeDedupe(['a'])
    assert.deepStrictEqual([...result], ['a'])
    assert.ok(Object.isFrozen(result))
  })

  test('should deduplicate array', () => {
    const a = () => {}
    const b = () => {}
    const result = freezeDedupe([a, b, a, b])
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0], a)
    assert.strictEqual(result[1], b)
  })

  test('should freeze the result', () => {
    const result = freezeDedupe([1, 2, 3])
    assert.ok(Object.isFrozen(result))
  })

  test('should preserve order (first occurrence)', () => {
    const result = freezeDedupe([3, 1, 2, 1, 3])
    assert.deepStrictEqual([...result], [3, 1, 2])
  })
})

describe('closeWireServices', () => {
  test('should call close on services that have it', async () => {
    let closeCalled = false
    const mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }
    const wireServices = {
      serviceA: {
        close: async () => {
          closeCalled = true
        },
      },
      serviceB: {},
    }

    await closeWireServices(mockLogger as any, wireServices as any)

    assert.strictEqual(closeCalled, true)
  })

  test('should handle errors during close gracefully', async () => {
    let errorLogged = false
    const mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {
        errorLogged = true
      },
      debug: () => {},
    }
    const wireServices = {
      serviceA: {
        close: async () => {
          throw new Error('close failed')
        },
      },
    }

    await closeWireServices(mockLogger as any, wireServices as any)

    assert.strictEqual(errorLogged, true)
  })

  test('should skip services without close method', async () => {
    const mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }
    const wireServices = {
      serviceA: { doStuff: () => {} },
      serviceB: null,
    }

    await closeWireServices(mockLogger as any, wireServices as any)
    // Should not throw
  })
})

describe('stopSingletonServices', () => {
  test('should stop addon services first, then parent services', async () => {
    const order: string[] = []
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      serviceA: {
        stop: async () => {
          order.push('parent-serviceA')
        },
      },
    }
    pikkuState(null, 'package', 'singletonServices', mockServices as any)

    initializePikkuState('@addon/pkg')
    const addonServices = {
      addonService: {
        stop: async () => {
          order.push('addon-addonService')
        },
      },
    }
    pikkuState(
      '@addon/pkg',
      'package',
      'singletonServices',
      addonServices as any
    )

    await stopSingletonServices()

    assert.ok(
      order.indexOf('addon-addonService') < order.indexOf('parent-serviceA')
    )
  })

  test('should handle services without stop method', async () => {
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      noStop: {},
    }
    pikkuState(null, 'package', 'singletonServices', mockServices as any)

    await stopSingletonServices()
    // Should not throw
  })

  test('should handle errors during stop gracefully', async () => {
    let errorLogged = false
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {
          errorLogged = true
        },
        debug: () => {},
      },
      failing: {
        stop: async () => {
          throw new Error('stop failed')
        },
      },
    }
    pikkuState(null, 'package', 'singletonServices', mockServices as any)

    await stopSingletonServices()

    assert.strictEqual(errorLogged, true)
  })

  test('should clear addon singleton services after stopping', async () => {
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    }
    pikkuState(null, 'package', 'singletonServices', mockServices as any)

    initializePikkuState('@addon/pkg')
    pikkuState('@addon/pkg', 'package', 'singletonServices', {
      s: { stop: async () => {} },
    } as any)

    await stopSingletonServices()

    const addonServices = pikkuState(
      '@addon/pkg',
      'package',
      'singletonServices'
    )
    assert.strictEqual(addonServices, null)
  })
})
