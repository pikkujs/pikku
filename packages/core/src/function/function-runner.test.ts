import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import { addFunction, runPikkuFunc } from './function-runner.js'
import { addMiddleware, addPermission } from '../index.js'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import {
  CoreServices,
  CorePikkuMiddleware,
  PikkuWiringTypes,
} from '../types/core.types.js'
import { CorePermissionGroup } from './functions.types.js'

beforeEach(() => {
  resetPikkuState()
})

// Helper function to add function with metadata for tests
const addTestFunction = (funcName: string, funcConfig: any) => {
  addFunction(funcName, funcConfig)
  pikkuState('function', 'meta')[funcName] = {
    pikkuFuncName: funcName,
    inputSchemaName: null,
    outputSchemaName: null,
  }
}

const mockServices: CoreServices = {
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
} as any

describe('runPikkuFunc - Integration Tests', () => {
  test('should execute middleware in correct order: wiringTags → wiringMiddleware → funcMiddleware → funcTags', async () => {
    const executionOrder: string[] = []
    const createMiddleware = (name: string): CorePikkuMiddleware => {
      return async (services, interaction, next) => {
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
      PikkuWiringTypes.rpc,
      Math.random().toString(),
      'testFunc',
      {
        getAllServices: () => mockServices,
        data: {},
        middleware: [createMiddleware('wiringMiddleware')],
        tags: ['wiringTag'],
      }
    )

    assert.equal(result, 'success')
    // Order: wiringTags, wiringMiddleware, funcMiddleware, funcTags
    assert.deepEqual(executionOrder, [
      'wiringTag',
      'wiringMiddleware',
      'funcMiddleware',
      'funcTag',
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
      PikkuWiringTypes.rpc,
      Math.random().toString(),
      'testFunc',
      {
        getAllServices: () => mockServices,
        data: {},
        permissions: wiringPermissions,
        tags: ['wiringTag'],
      }
    )

    assert.equal(result, 'success')
    // Order: wiringTags → wiringPermissions → funcTags → funcPermissions
    assert.deepEqual(executionOrder, [
      'wiringTag',
      'wiringPermission',
      'funcTag',
      'funcPermission',
      'main',
    ])
  })

  test('should throw specific error for wiring tag permission failures', async () => {
    const failingWiringTagPermission = async () => false

    addPermission('wiringTag', [failingWiringTagPermission])

    addTestFunction('testFunc', {
      func: async () => 'success',
    })

    await assert.rejects(
      runPikkuFunc(PikkuWiringTypes.rpc, Math.random().toString(), 'testFunc', {
        getAllServices: () => mockServices,
        data: {},
        tags: ['wiringTag'],
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
      runPikkuFunc(PikkuWiringTypes.rpc, Math.random().toString(), 'testFunc', {
        getAllServices: () => mockServices,
        data: {},
        permissions: wiringPermissions,
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
      runPikkuFunc(PikkuWiringTypes.rpc, Math.random().toString(), 'testFunc', {
        getAllServices: () => mockServices,
        data: {},
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
      runPikkuFunc(PikkuWiringTypes.rpc, Math.random().toString(), 'testFunc', {
        getAllServices: () => mockServices,
        data: {},
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
      interaction,
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

    await runPikkuFunc(
      PikkuWiringTypes.rpc,
      Math.random().toString(),
      'testFunc',
      {
        getAllServices: () => mockServices,
        data: {},
      }
    )

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
      PikkuWiringTypes.rpc,
      Math.random().toString(),
      'testFunc',
      {
        getAllServices: () => mockServices,
        data: {},
      }
    )

    assert.equal(result, 'success')
    // Should execute tag permissions first, then function permissions
    assert.deepEqual(executionOrder, [
      'arrayPermission1',
      'arrayPermission2',
      'objectPermission',
      'main',
    ])
  })

  test('should work without any middleware or permissions', async () => {
    addTestFunction('simpleFunc', {
      func: async () => 'simple success',
    })

    const result = await runPikkuFunc(
      PikkuWiringTypes.rpc,
      Math.random().toString(),
      'simpleFunc',
      {
        getAllServices: () => mockServices,
        data: {},
      }
    )

    assert.equal(result, 'simple success')
  })

  test('should work with only wiring-level middleware and permissions', async () => {
    const executionOrder: string[] = []

    const wiringMiddleware: CorePikkuMiddleware = async (
      services,
      interaction,
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
      PikkuWiringTypes.rpc,
      Math.random().toString(),
      'testFunc',
      {
        getAllServices: () => mockServices,
        data: {},
        middleware: [wiringMiddleware],
        permissions: wiringPermissions,
      }
    )

    assert.equal(result, 'success')
    assert.deepEqual(executionOrder, [
      'wiringPermission',
      'wiringMiddleware',
      'main',
    ])
  })

  test('should work with only function-level middleware and permissions', async () => {
    const executionOrder: string[] = []

    const funcMiddleware: CorePikkuMiddleware = async (
      services,
      interaction,
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
      PikkuWiringTypes.rpc,
      Math.random().toString(),
      'testFunc',
      {
        getAllServices: () => mockServices,
        data: {},
      }
    )

    assert.equal(result, 'success')
    assert.deepEqual(executionOrder, [
      'funcPermission',
      'funcMiddleware',
      'main',
    ])
  })

  test('should pass correct parameters to function', async () => {
    let receivedServices: any
    let receivedData: any
    let receivedSession: any

    const testData = { test: 'data' }
    const testSession = { userId: 'test-user' }

    addTestFunction('testFunc', {
      func: async (services, data, session) => {
        receivedServices = services
        receivedData = data
        receivedSession = session
        return 'success'
      },
    })

    await runPikkuFunc(
      PikkuWiringTypes.rpc,
      Math.random().toString(),
      'testFunc',
      {
        getAllServices: () => mockServices,
        data: testData,
        session: testSession,
      }
    )

    assert.equal(receivedServices, mockServices)
    assert.equal(receivedData, testData)
    assert.equal(receivedSession, testSession)
  })

  test('should handle async getAllServices function', async () => {
    let servicesProvided: any

    addTestFunction('testFunc', {
      func: async (services) => {
        servicesProvided = services
        return 'success'
      },
    })

    const asyncGetServices = async () => {
      // Simulate async service creation
      await new Promise((resolve) => setTimeout(resolve, 1))
      return mockServices
    }

    const result = await runPikkuFunc(
      PikkuWiringTypes.rpc,
      Math.random().toString(),
      'testFunc',
      {
        getAllServices: asyncGetServices,
        data: {},
      }
    )

    assert.equal(result, 'success')
    assert.equal(servicesProvided, mockServices)
  })
})
