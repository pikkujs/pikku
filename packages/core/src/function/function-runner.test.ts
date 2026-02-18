import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import { addFunction, runPikkuFunc } from './function-runner.js'
import { addMiddleware, addPermission } from '../index.js'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import { CoreServices, CorePikkuMiddleware } from '../types/core.types.js'
import { CorePermissionGroup } from './functions.types.js'

beforeEach(() => {
  resetPikkuState()
})

// Helper function to add function with metadata for tests
const addTestFunction = (funcName: string, funcConfig: any) => {
  addFunction(funcName, funcConfig)
  // Convert tags to middleware metadata
  const middleware = funcConfig.tags
    ? funcConfig.tags.map((tag: string) => ({ type: 'tag' as const, tag }))
    : undefined
  // Convert tags to permissions metadata
  const permissions = funcConfig.tags
    ? funcConfig.tags.map((tag: string) => ({ type: 'tag' as const, tag }))
    : undefined
  pikkuState(null, 'function', 'meta')[funcName] = {
    pikkuFuncId: funcName,
    inputSchemaName: null,
    outputSchemaName: null,
    middleware,
    permissions,
  }
}

const mockSingletonServices = {
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
} as any

const mockServices: CoreServices = {
  ...mockSingletonServices,
} as any

describe('runPikkuFunc - Integration Tests', () => {
  test('should execute middleware in correct order: wiringTags → wiringMiddleware → funcTags → funcMiddleware', async () => {
    const executionOrder: string[] = []
    const createMiddleware = (name: string): CorePikkuMiddleware => {
      return async (services, wire, next) => {
        executionOrder.push(name)
        await next()
      }
    }

    addMiddleware('wiringTag', [createMiddleware('wiringTag')])
    addMiddleware('funcTag', [createMiddleware('funcTag')])

    // Register function with middleware and tags
    addTestFunction('testFunc', {
      func: async () => {
        executionOrder.push('main')
        return 'success'
      },
      middleware: [createMiddleware('funcMiddleware')],
      tags: ['funcTag'],
    })

    const result = await runPikkuFunc(
      'rpc',
      Math.random().toString(),
      'testFunc',
      {
        singletonServices: mockSingletonServices,
        getAllServices: () => mockServices,
        data: () => ({}),
        wireMiddleware: [createMiddleware('wiringMiddleware')],
        inheritedMiddleware: [{ type: 'tag', tag: 'wiringTag' }],
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'success')
    // Order: wireInheritedMiddleware (tags), wireMiddleware, funcInheritedMiddleware (tags), funcMiddleware
    assert.deepEqual(executionOrder, [
      'wiringTag',
      'wiringMiddleware',
      'funcTag',
      'funcMiddleware',
      'main',
    ])
  })

  test('should execute permissions in correct order: wiringTags → wiringPermissions → funcTags → funcPermissions', async () => {
    const executionOrder: string[] = []

    // Setup tagged permissions
    const wiringTagPermission = async () => {
      executionOrder.push('wiringTag')
      return true
    }
    const funcTagPermission = async () => {
      executionOrder.push('funcTag')
      return true
    }

    addPermission('wiringTag', [wiringTagPermission])
    addPermission('funcTag', [funcTagPermission])

    // Setup direct permissions
    const wiringPermissions: CorePermissionGroup = {
      permissions: [
        async () => {
          executionOrder.push('wiringPermission')
          return true
        },
      ],
    }
    const funcPermissions: CorePermissionGroup = {
      permissions: [
        async () => {
          executionOrder.push('funcPermission')
          return true
        },
      ],
    }

    // Register function with permissions and tags
    addTestFunction('testFunc', {
      func: async () => {
        executionOrder.push('main')
        return 'success'
      },
      permissions: funcPermissions,
      tags: ['funcTag'],
    })

    const result = await runPikkuFunc(
      'rpc',
      Math.random().toString(),
      'testFunc',
      {
        singletonServices: mockSingletonServices,
        getAllServices: () => mockServices,
        data: () => ({}),
        wirePermissions: wiringPermissions,
        tags: ['wiringTag'],
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'success')
    // Order: wiringTags → main (short-circuit on first passing group)
    assert.deepEqual(executionOrder, ['wiringTag', 'main'])
  })

  test('should throw specific error for wiring tag permission failures', async () => {
    const failingWiringTagPermission = async () => false

    addPermission('wiringTag', [failingWiringTagPermission])

    addTestFunction('testFunc', {
      func: async () => 'success',
    })

    await assert.rejects(
      runPikkuFunc('rpc', Math.random().toString(), 'testFunc', {
        singletonServices: mockSingletonServices,
        getAllServices: () => mockServices,
        data: () => ({}),
        tags: ['wiringTag'],
        auth: false,
        wire: {},
      }),
      {
        message: 'Permission denied',
      }
    )
  })

  test('should throw specific error for wiring permission failures', async () => {
    const wiringPermissions: CorePermissionGroup = {
      permissions: [async () => false],
    }

    addTestFunction('testFunc', {
      func: async () => 'success',
    })

    await assert.rejects(
      runPikkuFunc('rpc', Math.random().toString(), 'testFunc', {
        singletonServices: mockSingletonServices,
        getAllServices: () => mockServices,
        data: () => ({}),
        wirePermissions: wiringPermissions,
        auth: false,
        wire: {},
      }),
      {
        message: 'Permission denied',
      }
    )
  })

  test('should throw specific error for function tag permission failures', async () => {
    const failingFuncTagPermission = async () => false

    addPermission('funcTag', [failingFuncTagPermission])

    addTestFunction('testFunc', {
      func: async () => 'success',
      tags: ['funcTag'],
    })

    await assert.rejects(
      runPikkuFunc('rpc', Math.random().toString(), 'testFunc', {
        singletonServices: mockSingletonServices,
        getAllServices: () => mockServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }),
      {
        message: 'Permission denied',
      }
    )
  })

  test('should throw specific error for function permission failures', async () => {
    const funcPermissions: CorePermissionGroup = {
      permissions: [async () => false],
    }

    addTestFunction('testFunc', {
      func: async () => 'success',
      permissions: funcPermissions,
    })

    await assert.rejects(
      runPikkuFunc('rpc', Math.random().toString(), 'testFunc', {
        singletonServices: mockSingletonServices,
        getAllServices: () => mockServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }),
      {
        message: 'Permission denied',
      }
    )
  })

  test('should deduplicate middleware when same middleware appears in tags and direct', async () => {
    let executionCount = 0

    const duplicatedMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      executionCount++
      await next()
    }

    // Add same middleware to tag and directly
    addMiddleware('testTag', [duplicatedMiddleware])

    addTestFunction('testFunc', {
      func: async () => 'success',
      middleware: [duplicatedMiddleware], // Same middleware directly
      tags: ['testTag'], // Same middleware via tag
    })

    await runPikkuFunc('rpc', Math.random().toString(), 'testFunc', {
      singletonServices: mockSingletonServices,
      getAllServices: () => mockServices,
      data: () => ({}),
      auth: false,
      wire: {},
    })

    // Should only execute once due to deduplication
    assert.equal(executionCount, 1)
  })

  test('should handle mixed permission types correctly', async () => {
    const executionOrder: string[] = []

    // Mix of array and object permissions
    const arrayPermission = [
      async () => {
        executionOrder.push('arrayPermission1')
        return false
      },
      async () => {
        executionOrder.push('arrayPermission2')
        return true
      },
    ]

    const objectPermission: CorePermissionGroup = {
      permissions: [
        async () => {
          executionOrder.push('objectPermission')
          return true
        },
      ],
    }

    addPermission('mixedTag', arrayPermission)

    addTestFunction('testFunc', {
      func: async () => {
        executionOrder.push('main')
        return 'success'
      },
      permissions: objectPermission,
      tags: ['mixedTag'],
    })

    const result = await runPikkuFunc(
      'rpc',
      Math.random().toString(),
      'testFunc',
      {
        singletonServices: mockSingletonServices,
        getAllServices: () => mockServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'success')
    // Should execute tag permissions and short-circuit before function permissions
    assert.deepEqual(executionOrder, [
      'arrayPermission1',
      'arrayPermission2',
      'main',
    ])
  })

  test('should work without any middleware or permissions', async () => {
    addTestFunction('simpleFunc', {
      func: async () => 'simple success',
    })

    const result = await runPikkuFunc(
      'rpc',
      Math.random().toString(),
      'simpleFunc',
      {
        singletonServices: mockSingletonServices,
        getAllServices: () => mockServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'simple success')
  })

  test('should work with only wiring-level middleware and permissions', async () => {
    const executionOrder: string[] = []

    const wiringMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      executionOrder.push('wiringMiddleware')
      await next()
    }

    const wiringPermissions: CorePermissionGroup = {
      permissions: [
        async () => {
          executionOrder.push('wiringPermission')
          return true
        },
      ],
    }

    addTestFunction('testFunc', {
      func: async () => {
        executionOrder.push('main')
        return 'success'
      },
    })

    const result = await runPikkuFunc(
      'rpc',
      Math.random().toString(),
      'testFunc',
      {
        singletonServices: mockSingletonServices,
        getAllServices: () => mockServices,
        data: () => ({}),
        wireMiddleware: [wiringMiddleware],
        wirePermissions: wiringPermissions,
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'success')
    // Permissions run after middleware (middleware can set/modify session)
    assert.deepEqual(executionOrder, [
      'wiringMiddleware',
      'wiringPermission',
      'main',
    ])
  })

  test('should work with only function-level middleware and permissions', async () => {
    const executionOrder: string[] = []

    const funcMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      executionOrder.push('funcMiddleware')
      await next()
    }

    const funcPermissions: CorePermissionGroup = {
      permissions: [
        async () => {
          executionOrder.push('funcPermission')
          return true
        },
      ],
    }

    addTestFunction('testFunc', {
      func: async () => {
        executionOrder.push('main')
        return 'success'
      },
      middleware: [funcMiddleware],
      permissions: funcPermissions,
    })

    const result = await runPikkuFunc(
      'rpc',
      Math.random().toString(),
      'testFunc',
      {
        singletonServices: mockSingletonServices,
        getAllServices: () => mockServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'success')
    // Permissions run after middleware (middleware can set/modify session)
    assert.deepEqual(executionOrder, [
      'funcMiddleware',
      'funcPermission',
      'main',
    ])
  })

  test('should pass correct parameters to function', async () => {
    let receivedServices: any
    let receivedData: any
    let receivedWire: any

    const testData = { test: 'data' }

    addTestFunction('testFunc', {
      func: async (services, data, wire) => {
        receivedServices = services
        receivedData = data
        receivedWire = wire
        return 'success'
      },
    })

    await runPikkuFunc('rpc', Math.random().toString(), 'testFunc', {
      singletonServices: mockServices,
      data: () => testData,
      auth: false,
      wire: { rpc: {} },
    })

    assert.deepEqual(receivedServices, mockServices)
    assert.equal(receivedData, testData)
    // Check that wire has rpc service and session
    assert.ok(receivedWire.rpc)
    assert.equal(receivedWire.session, undefined)
  })

  test('should handle async createWireServices function', async () => {
    let servicesProvided: any
    const wireServices = { customService: 'value' }

    addTestFunction('testFunc', {
      func: async (services, data, wire) => {
        servicesProvided = services
        return 'success'
      },
    })

    const asyncCreateWireServices = async () => {
      // Simulate async service creation
      await new Promise((resolve) => setTimeout(resolve, 1))
      return wireServices
    }

    const result = await runPikkuFunc(
      'rpc',
      Math.random().toString(),
      'testFunc',
      {
        singletonServices: mockSingletonServices,
        createWireServices: asyncCreateWireServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'success')
    assert.deepEqual(servicesProvided, {
      ...mockSingletonServices,
      ...wireServices,
    })
  })
})
