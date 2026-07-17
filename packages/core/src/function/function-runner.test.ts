import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import {
  addFunction,
  getAllFunctionNames,
  getFunctionNames,
  runPikkuFunc,
} from './function-runner.js'
import {
  addGlobalPermission,
  addTagMiddleware,
  addTagPermission,
} from '../index.js'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import type { CoreServices, CorePikkuMiddleware } from '../types/core.types.js'
import type { CorePermissionGroup } from './functions.types.js'
import { PikkuSessionService } from '../services/user-session-service.js'
import { MissingScopeError, ReadonlySessionError } from '../errors/errors.js'
import { createInvocationAudit } from '../services/audit-service.js'

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
    sessionless: true,
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

    addTagMiddleware('wiringTag', [createMiddleware('wiringTag')])
    addTagMiddleware('funcTag', [createMiddleware('funcTag')])

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

    addTagPermission('wiringTag', [wiringTagPermission])
    addTagPermission('funcTag', [funcTagPermission])

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

    addTagPermission('wiringTag', [failingWiringTagPermission])

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

    addTagPermission('funcTag', [failingFuncTagPermission])

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
    addTagMiddleware('testTag', [duplicatedMiddleware])

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

    addTagPermission('mixedTag', arrayPermission)

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

  test('should resolve versioned function ids to the base function and warn once', async () => {
    const warnings: string[] = []
    const singletonServices = {
      ...mockSingletonServices,
      logger: {
        ...mockSingletonServices.logger,
        warn: (message: string) => {
          warnings.push(message)
        },
      },
    } as any

    addTestFunction('versionedBase', {
      func: async () => 'resolved',
    })

    const result = await runPikkuFunc(
      'rpc',
      Math.random().toString(),
      'versionedBase@v2',
      {
        singletonServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'resolved')
    assert.equal(warnings.length, 1)
    assert.match(
      warnings[0]!,
      /Version 'versionedBase@v2' not registered, resolved to 'versionedBase'/
    )
  })

  test('should throw when function metadata is missing', async () => {
    addFunction('metaMissing', {
      func: async () => 'ok',
    } as any)

    await assert.rejects(
      () =>
        runPikkuFunc('rpc', Math.random().toString(), 'metaMissing', {
          singletonServices: mockSingletonServices,
          data: () => ({}),
          auth: false,
          wire: {},
        }),
      {
        message: 'Function meta not found: metaMissing',
      }
    )
  })

  test('should throw when function config is missing', async () => {
    pikkuState(null, 'function', 'meta').missingConfig = {
      pikkuFuncId: 'missingConfig',
      sessionless: true,
      permissions: [],
    } as any

    await assert.rejects(
      () =>
        runPikkuFunc('rpc', Math.random().toString(), 'missingConfig', {
          singletonServices: mockSingletonServices,
          data: () => ({}),
          auth: false,
          wire: {},
        }),
      {
        message: 'Function not found: missingConfig',
      }
    )
  })

  test('should require a session when sessionless metadata is false', async () => {
    addTestFunction('sessionRequired', {
      func: async () => 'ok',
    })
    pikkuState(null, 'function', 'meta').sessionRequired.sessionless = false

    await assert.rejects(
      () =>
        runPikkuFunc('rpc', Math.random().toString(), 'sessionRequired', {
          singletonServices: mockSingletonServices,
          data: () => ({}),
          auth: true,
          wire: {},
        }),
      {
        message: 'Authentication required',
      }
    )
  })

  test('should warn when auth is disabled for a session-required function but still enforce session', async () => {
    const warnings: string[] = []
    const singletonServices = {
      ...mockSingletonServices,
      logger: {
        ...mockSingletonServices.logger,
        warn: (message: string) => {
          warnings.push(message)
        },
      },
    } as any

    addTestFunction('sessionRequired', {
      func: async () => 'ok',
      auth: false,
    })
    pikkuState(null, 'function', 'meta').sessionRequired.sessionless = false

    await assert.rejects(
      () =>
        runPikkuFunc('rpc', Math.random().toString(), 'sessionRequired', {
          singletonServices,
          data: () => ({}),
          auth: false,
          wire: {},
        }),
      {
        message: 'Authentication required',
      }
    )

    assert.equal(warnings.length, 1)
    assert.match(
      warnings[0]!,
      /requires a session but auth was explicitly disabled/
    )
  })

  test('should require auth when sessionless metadata is absent (undefined defaults to session-required)', async () => {
    addTestFunction('legacyAuth', {
      func: async () => 'ok',
      auth: true,
    })
    delete pikkuState(null, 'function', 'meta').legacyAuth.sessionless

    await assert.rejects(
      () =>
        runPikkuFunc('rpc', Math.random().toString(), 'legacyAuth', {
          singletonServices: mockSingletonServices,
          data: () => ({}),
          auth: false,
          wire: {},
        }),
      {
        message: 'Authentication required',
      }
    )
  })

  test('should reject readonly sessions for non-readonly functions', async () => {
    addTestFunction('readonlyBlocked', {
      func: async () => 'ok',
    })
    pikkuState(null, 'function', 'meta').readonlyBlocked.sessionless = true

    await assert.rejects(
      () =>
        runPikkuFunc('rpc', Math.random().toString(), 'readonlyBlocked', {
          singletonServices: mockSingletonServices,
          data: () => ({}),
          auth: false,
          wire: { session: { readonly: true } as any },
        }),
      ReadonlySessionError
    )
  })

  test('should set session helpers on the wire when a session service is provided', async () => {
    const sessionStore = {
      get: async () => undefined,
    }
    const sessionService = new PikkuSessionService(sessionStore as any)
    const wire: any = {}
    let receivedWire: any

    addTestFunction('sessionHelpers', {
      func: async (_services: any, _data: any, innerWire: any) => {
        receivedWire = innerWire
        innerWire.setSession({ userId: 'u1' })
        return innerWire.getSession()
      },
    })

    const result = await runPikkuFunc(
      'rpc',
      Math.random().toString(),
      'sessionHelpers',
      {
        singletonServices: {
          ...mockSingletonServices,
          sessionStore,
        } as any,
        data: () => ({}),
        auth: false,
        wire,
        sessionService,
      }
    )

    assert.deepEqual(result, { userId: 'u1' })
    assert.equal(typeof receivedWire.setSession, 'function')
    assert.equal(typeof receivedWire.clearSession, 'function')
    assert.equal(typeof receivedWire.getSession, 'function')
    assert.equal(typeof receivedWire.hasSessionChanged, 'function')
  })

  test('should load session from sessionStore using pikkuUserId from the wire', async () => {
    let sessionLookups = 0
    let receivedSession: any

    addTestFunction('loadStoredSession', {
      func: async (_services: any, _data: any, wire: any) => {
        receivedSession = wire.session
        return 'ok'
      },
    })

    await runPikkuFunc('rpc', Math.random().toString(), 'loadStoredSession', {
      singletonServices: {
        ...mockSingletonServices,
        sessionStore: {
          get: async (userId: string) => {
            sessionLookups++
            assert.equal(userId, 'user-1')
            return { userId, loaded: true }
          },
        },
      } as any,
      data: () => ({}),
      auth: false,
      wire: { pikkuUserId: 'user-1' },
    })

    assert.equal(sessionLookups, 1)
    assert.deepEqual(receivedSession, { userId: 'user-1', loaded: true })
  })

  test('should expose middleware-set session to createWireServices credential lookups', async () => {
    let credentialLookups = 0
    let receivedCredential: any
    const sessionService = new PikkuSessionService<any>()

    addTestFunction('credentialWire', {
      middleware: [
        async (_services: any, wire: any, next: any) => {
          wire.setSession({ userId: 'user-1' })
          await next()
        },
      ],
      func: async (_services: any, _data: any, wire: any) => {
        return wire.getSession()
      },
    })

    await runPikkuFunc('rpc', Math.random().toString(), 'credentialWire', {
      singletonServices: {
        ...mockSingletonServices,
        credentialService: {
          getAll: async (userId: string) => {
            credentialLookups++
            assert.equal(userId, 'user-1')
            return {
              'user-oauth': { accessToken: 'token-1' },
            }
          },
        },
      } as any,
      createWireServices: async (_services: any, wire: any) => {
        receivedCredential = await wire.getCredential('user-oauth')
        return {}
      },
      data: () => ({}),
      auth: false,
      wire: {
        session: undefined,
        setSession: (session: any) => sessionService.setInitial(session),
        getSession: () => sessionService.get(),
        hasSessionChanged: () => sessionService.sessionChanged,
      } as any,
      sessionService,
    })

    assert.equal(credentialLookups, 1)
    assert.deepEqual(receivedCredential, { accessToken: 'token-1' })
  })

  test('should pass addon-scoped singleton services and wrap bare workflow names', async () => {
    pikkuState(null, 'addons', 'packages').set('stripe', {
      package: '@addon/stripe',
    } as any)

    const workflowCalls: unknown[][] = []
    let singletonFactoryCalls = 0
    let configFactoryCalls = 0

    pikkuState('@addon/stripe', 'package', 'factories', {
      createConfig: async () => {
        configFactoryCalls++
        return { name: 'addon-config' }
      },
      createSingletonServices: async () => {
        singletonFactoryCalls++
        return {
          logger: mockSingletonServices.logger,
          workflowService: {
            startWorkflow: async (...args: unknown[]) => {
              workflowCalls.push(args)
              return { runId: 'wf-1' }
            },
          },
        }
      },
    } as any)

    addFunction(
      'addonFunc',
      {
        func: async (services: any, _data: any) => {
          await services.workflowService.startWorkflow('chargeCustomer', {
            amount: 10,
          })
          await services.workflowService.startWorkflow('stripe:alreadyScoped', {
            amount: 20,
          })
          return 'ok'
        },
      } as any,
      '@addon/stripe'
    )
    pikkuState('@addon/stripe', 'function', 'meta').addonFunc = {
      pikkuFuncId: 'addonFunc',
      sessionless: true,
      permissions: [],
    } as any

    await runPikkuFunc('rpc', Math.random().toString(), 'addonFunc', {
      singletonServices: {
        ...mockSingletonServices,
        config: { parent: true },
        variables: {},
      } as any,
      data: () => ({}),
      auth: false,
      wire: {},
      packageName: '@addon/stripe',
    })

    assert.equal(configFactoryCalls, 1)
    assert.equal(singletonFactoryCalls, 1)
    assert.deepEqual(workflowCalls, [
      ['stripe:chargeCustomer', { amount: 10 }],
      ['stripe:alreadyScoped', { amount: 20 }],
    ])
  })

  test('should reuse cached addon singleton services on subsequent calls', async () => {
    let singletonFactoryCalls = 0
    pikkuState('@addon/cache', 'package', 'factories', {
      createSingletonServices: async () => {
        singletonFactoryCalls++
        return {
          logger: mockSingletonServices.logger,
        }
      },
    } as any)

    addFunction(
      'cachedFunc',
      {
        func: async () => 'ok',
      } as any,
      '@addon/cache'
    )
    pikkuState('@addon/cache', 'function', 'meta').cachedFunc = {
      pikkuFuncId: 'cachedFunc',
      sessionless: true,
      permissions: [],
    } as any

    await runPikkuFunc('rpc', '1', 'cachedFunc', {
      singletonServices: mockSingletonServices,
      data: () => ({}),
      auth: false,
      wire: {},
      packageName: '@addon/cache',
    })
    await runPikkuFunc('rpc', '2', 'cachedFunc', {
      singletonServices: mockSingletonServices,
      data: () => ({}),
      auth: false,
      wire: {},
      packageName: '@addon/cache',
    })

    assert.equal(singletonFactoryCalls, 1)
  })

  test('should use addon createWireServices instead of the caller createWireServices', async () => {
    let callerCreateWireServicesUsed = false
    let addonCreateWireServicesUsed = false
    let receivedServices: any

    pikkuState('@addon/wires', 'package', 'factories', {
      createSingletonServices: async () => ({
        logger: mockSingletonServices.logger,
      }),
      createWireServices: async () => {
        addonCreateWireServicesUsed = true
        return { addonWire: true }
      },
    } as any)

    addFunction(
      'wireFunc',
      {
        func: async (services: any) => {
          receivedServices = services
          return 'ok'
        },
      } as any,
      '@addon/wires'
    )
    pikkuState('@addon/wires', 'function', 'meta').wireFunc = {
      pikkuFuncId: 'wireFunc',
      sessionless: true,
      permissions: [],
    } as any

    await runPikkuFunc('rpc', 'wire', 'wireFunc', {
      singletonServices: mockSingletonServices,
      createWireServices: async () => {
        callerCreateWireServicesUsed = true
        return { callerWire: true }
      },
      data: () => ({}),
      auth: false,
      wire: {},
      packageName: '@addon/wires',
    })

    assert.equal(callerCreateWireServicesUsed, false)
    assert.equal(addonCreateWireServicesUsed, true)
    assert.deepEqual(receivedServices, {
      logger: mockSingletonServices.logger,
      addonWire: true,
    })
  })

  test('should lazily memoize the rpc getter on the wire', async () => {
    let receivedWire: any

    addTestFunction('rpcGetter', {
      func: async (_services: any, _data: any, wire: any) => {
        receivedWire = wire
        const rpcA = wire.rpc
        const rpcB = wire.rpc
        return rpcA === rpcB
      },
    })

    const result = await runPikkuFunc('rpc', 'rpc-getter', 'rpcGetter', {
      singletonServices: mockSingletonServices,
      data: () => ({}),
      auth: false,
      wire: {},
    })

    assert.equal(result, true)
    assert.ok(receivedWire.rpc)
  })

  test('should expose resolved audit metadata on the wire for audited functions', async () => {
    let receivedAudit: any

    addTestFunction('auditedWire', {
      audit: { durability: 'transactional' },
      func: async (_services: any, _data: any, wire: any) => {
        receivedAudit = wire.audit
        return 'ok'
      },
    })

    const result = await runPikkuFunc('rpc', 'wire-audit-on', 'auditedWire', {
      singletonServices: mockSingletonServices,
      data: () => ({}),
      auth: false,
      wire: {},
    })

    assert.equal(result, 'ok')
    assert.deepEqual(receivedAudit, { durability: 'transactional' })
  })

  test('should leave wire audit metadata undefined when audit is disabled', async () => {
    let receivedWire: any

    addTestFunction('plainWire', {
      func: async (_services: any, _data: any, wire: any) => {
        receivedWire = wire
        return 'ok'
      },
    })

    const result = await runPikkuFunc('rpc', 'wire-audit-off', 'plainWire', {
      singletonServices: mockSingletonServices,
      data: () => ({}),
      auth: false,
      wire: {},
    })

    assert.equal(result, 'ok')
    assert.equal(receivedWire.audit, undefined)
  })

  test('should restore parent audit metadata after nested non-audited calls', async () => {
    let auditBeforeChild: any
    let auditAfterChild: any

    addTestFunction('childPlain', {
      func: async () => 'child-ok',
    })

    addTestFunction('parentAudited', {
      audit: true,
      func: async (_services: any, _data: any, wire: any) => {
        auditBeforeChild = wire.audit
        await runPikkuFunc('rpc', 'nested-child-wire', 'childPlain', {
          singletonServices: mockSingletonServices,
          data: () => ({}),
          auth: false,
          wire,
        })
        auditAfterChild = wire.audit
        return 'parent-ok'
      },
    })

    const result = await runPikkuFunc(
      'rpc',
      'nested-parent-wire',
      'parentAudited',
      {
        singletonServices: mockSingletonServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'parent-ok')
    assert.deepEqual(auditBeforeChild, { durability: 'best-effort' })
    assert.deepEqual(auditAfterChild, { durability: 'best-effort' })
  })

  test('should preserve parent audit metadata across rpc sub-calls to non-audited functions', async () => {
    let parentAuditBeforeChild: any
    let parentAuditAfterChild: any
    let parentFunctionIdBeforeChild: any
    let parentFunctionIdAfterChild: any
    let childAudit: any
    let childFunctionId: any

    addTestFunction('rpcChildPlain', {
      func: async (_services: any, _data: any, wire: any) => {
        childAudit = wire.audit
        childFunctionId = wire.functionId
        return 'child-ok'
      },
    })

    addTestFunction('rpcParentAudited', {
      audit: true,
      func: async (_services: any, _data: any, wire: any) => {
        parentAuditBeforeChild = wire.audit
        parentFunctionIdBeforeChild = wire.functionId
        const childResult = await wire.rpc.invoke('rpcChildPlain', {})
        parentAuditAfterChild = wire.audit
        parentFunctionIdAfterChild = wire.functionId
        return childResult
      },
    })

    const result = await runPikkuFunc(
      'rpc',
      'rpc-parent-wire',
      'rpcParentAudited',
      {
        singletonServices: mockSingletonServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'child-ok')
    assert.deepEqual(parentAuditBeforeChild, { durability: 'best-effort' })
    assert.deepEqual(parentAuditAfterChild, { durability: 'best-effort' })
    assert.equal(parentFunctionIdBeforeChild, 'rpcParentAudited')
    assert.equal(parentFunctionIdAfterChild, 'rpcParentAudited')
    assert.equal(childAudit, undefined)
    assert.equal(childFunctionId, 'rpcChildPlain')
  })

  test('should bind audited rpc sub-calls to the child invocation context', async () => {
    let parentAuditBeforeChild: any
    let parentAuditAfterChild: any
    let parentFunctionIdAfterChild: any
    let childAudit: any
    let childFunctionId: any

    addTestFunction('rpcChildAudited', {
      audit: { durability: 'transactional' },
      func: async (_services: any, _data: any, wire: any) => {
        childAudit = wire.audit
        childFunctionId = wire.functionId
        return 'child-audited-ok'
      },
    })

    addTestFunction('rpcParentAuditedChild', {
      audit: true,
      func: async (_services: any, _data: any, wire: any) => {
        parentAuditBeforeChild = wire.audit
        const childResult = await wire.rpc.invoke('rpcChildAudited', {})
        parentAuditAfterChild = wire.audit
        parentFunctionIdAfterChild = wire.functionId
        return childResult
      },
    })

    const result = await runPikkuFunc(
      'rpc',
      'rpc-parent-child-audit-wire',
      'rpcParentAuditedChild',
      {
        singletonServices: mockSingletonServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'child-audited-ok')
    assert.deepEqual(parentAuditBeforeChild, { durability: 'best-effort' })
    assert.deepEqual(parentAuditAfterChild, { durability: 'best-effort' })
    assert.equal(parentFunctionIdAfterChild, 'rpcParentAuditedChild')
    assert.deepEqual(childAudit, { durability: 'transactional' })
    assert.equal(childFunctionId, 'rpcChildAudited')
  })

  test('should audit writes from an audited function invoked via exposed rpc (stale outer auditLog)', async () => {
    // Repro of the exposed-RPC HTTP path: the generated rpcCaller has no
    // audit config, and createWireServices builds auditLog on ITS wire —
    // the audited inner function must not inherit that disabled instance.
    const events: any[] = []
    const singletonServices = {
      ...mockSingletonServices,
      audit: { audit: async (event: any) => events.push(event) },
    }

    addTestFunction('auditedInner', {
      audit: true,
      func: async (services: any) => {
        await services.auditLog.write({
          type: 'booking.update',
          source: 'explicit',
        })
        return 'inner-ok'
      },
    })

    addTestFunction('rpcCallerLike', {
      func: async (_services: any, _data: any, wire: any) => {
        return wire.rpc.invoke('auditedInner', {})
      },
    })

    const result = await runPikkuFunc(
      'http',
      'exposed-rpc-route',
      'rpcCallerLike',
      {
        singletonServices,
        data: () => ({}),
        auth: false,
        wire: {},
        createWireServices: async (services: any, wire: any) => ({
          auditLog: createInvocationAudit(services.audit, wire),
        }),
      }
    )

    assert.equal(result, 'inner-ok')
    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'booking.update')
    assert.equal(events[0].functionId, 'auditedInner')
  })

  test('should give an audited rpc sub-call its own audit buffer with child attribution', async () => {
    const events: any[] = []
    const singletonServices = {
      ...mockSingletonServices,
      audit: { audit: async (event: any) => events.push(event) },
    }

    addTestFunction('auditedChildWriter', {
      audit: true,
      func: async (services: any) => {
        await services.auditLog.write({
          type: 'child.event',
          source: 'explicit',
        })
        return 'child-ok'
      },
    })

    addTestFunction('auditedParentWriter', {
      audit: true,
      func: async (services: any, _data: any, wire: any) => {
        await services.auditLog.write({
          type: 'parent.event',
          source: 'explicit',
        })
        return wire.rpc.invoke('auditedChildWriter', {})
      },
    })

    const result = await runPikkuFunc(
      'rpc',
      'audited-parent-child',
      'auditedParentWriter',
      {
        singletonServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'child-ok')
    const byType = Object.fromEntries(events.map((e) => [e.type, e.functionId]))
    assert.equal(byType['parent.event'], 'auditedParentWriter')
    assert.equal(byType['child.event'], 'auditedChildWriter')
  })

  test('should warn via the singleton logger when audit writes are dropped', async () => {
    const warnings: any[] = []
    const singletonServices = {
      ...mockSingletonServices,
      logger: {
        ...mockSingletonServices.logger,
        warn: (msg: any) => warnings.push(msg),
      },
      audit: { audit: async () => {} },
    }

    addTestFunction('unauditedWriter', {
      func: async (services: any) => {
        await services.auditLog.write({
          type: 'dropped.event',
          source: 'explicit',
        })
        return 'ok'
      },
    })

    const result = await runPikkuFunc(
      'rpc',
      'unaudited-writer',
      'unauditedWriter',
      {
        singletonServices,
        data: () => ({}),
        auth: false,
        wire: {},
        createWireServices: async (services: any, wire: any) => ({
          auditLog: createInvocationAudit(
            services.audit,
            wire,
            services.logger
          ),
        }),
      }
    )

    assert.equal(result, 'ok')
    assert.equal(warnings.length, 1)
    assert.match(String(warnings[0]), /dropped/)
    assert.match(String(warnings[0]), /unauditedWriter/)
  })

  test('should expose the resolved base function id after version fallback', async () => {
    let receivedFunctionId: any

    addTestFunction('versionedBase', {
      audit: true,
      func: async (_services: any, _data: any, wire: any) => {
        receivedFunctionId = wire.functionId
        return 'ok'
      },
    })

    const result = await runPikkuFunc(
      'rpc',
      'wire-version-fallback',
      'versionedBase@v2',
      {
        singletonServices: mockSingletonServices,
        data: () => ({}),
        auth: false,
        wire: {},
      }
    )

    assert.equal(result, 'ok')
    assert.equal(receivedFunctionId, 'versionedBase')
  })
})

describe('function-runner helpers', () => {
  test('getFunctionNames and getAllFunctionNames should include addon namespaces', () => {
    addTestFunction('rootFunc', { func: async () => 'ok' })
    pikkuState(null, 'addons', 'packages').set('stripe', {
      package: '@addon/stripe',
    } as any)
    addFunction(
      'addonFunc',
      {
        func: async () => 'ok',
      } as any,
      '@addon/stripe'
    )
    pikkuState('@addon/stripe', 'function', 'meta').addonFunc = {
      pikkuFuncId: 'addonFunc',
      sessionless: true,
      permissions: [],
    } as any

    assert.deepEqual(getFunctionNames().sort(), ['rootFunc'])
    assert.deepEqual(getFunctionNames('@addon/stripe').sort(), ['addonFunc'])
    assert.deepEqual(getAllFunctionNames().sort(), [
      'rootFunc',
      'stripe:addonFunc',
    ])
  })
})

describe('runPikkuFunc - scopes', () => {
  const runWithScopes = (
    funcName: string,
    {
      scopes,
      sessionScopes,
      data = () => ({}),
    }: {
      scopes?: string[]
      sessionScopes?: string[]
      data?: () => any
    }
  ) =>
    runPikkuFunc('rpc', Math.random().toString(), funcName, {
      singletonServices: mockSingletonServices,
      data,
      auth: false,
      wire: { session: { userId: 'u1', scopes: sessionScopes } as any },
    })

  test('runs the function when the session holds the required scope', async () => {
    addTestFunction('scoped', {
      func: async () => 'ok',
      scopes: ['invoices:create'],
    })

    const result = await runWithScopes('scoped', {
      sessionScopes: ['invoices:create'],
    })

    assert.equal(result, 'ok')
  })

  test('throws MissingScopeError when the session lacks the scope', async () => {
    addTestFunction('scoped', {
      func: async () => 'ok',
      scopes: ['invoices:create'],
    })

    await assert.rejects(
      () => runWithScopes('scoped', { sessionScopes: ['billing:read'] }),
      MissingScopeError
    )
  })

  test('honours wildcards held by the session', async () => {
    addTestFunction('scoped', {
      func: async () => 'ok',
      scopes: ['admin:invoices:create'],
    })

    const result = await runWithScopes('scoped', { sessionScopes: ['admin:*'] })

    assert.equal(result, 'ok')
  })

  test('does not gate a function that declares no scopes', async () => {
    addTestFunction('unscoped', { func: async () => 'ok' })

    const result = await runWithScopes('unscoped', { sessionScopes: [] })

    assert.equal(result, 'ok')
  })

  test('reads scopes from function meta when the config omits them', async () => {
    addTestFunction('metaScoped', { func: async () => 'ok' })
    pikkuState(null, 'function', 'meta').metaScoped.scopes = ['invoices:create']

    await assert.rejects(
      () => runWithScopes('metaScoped', { sessionScopes: [] }),
      MissingScopeError
    )
  })

  // The load-bearing test. runPermissions ORs global/wire/tag/func permissions
  // and returns on the first pass, so a scope check placed inside that pool
  // would be satisfied by any passing permission anywhere in the app.
  test('a passing global permission does not satisfy a scope', async () => {
    addGlobalPermission([async () => true])
    addTestFunction('scoped', { func: async () => 'ok', scopes: ['admin'] })

    await assert.rejects(
      () => runWithScopes('scoped', { sessionScopes: [] }),
      MissingScopeError
    )
  })

  test('a passing function permission does not satisfy a scope', async () => {
    addTestFunction('scoped', {
      func: async () => 'ok',
      scopes: ['admin'],
      permissions: { allow: [async () => true] },
    })

    await assert.rejects(
      () => runWithScopes('scoped', { sessionScopes: [] }),
      MissingScopeError
    )
  })

  test('a held scope does not bypass a failing permission', async () => {
    addTestFunction('scoped', {
      func: async () => 'ok',
      scopes: ['admin'],
      permissions: { deny: [async () => false] },
    })

    await assert.rejects(
      () => runWithScopes('scoped', { sessionScopes: ['admin'] }),
      { message: 'Permission denied' }
    )
  })

  test('a failing scope short-circuits before permissions run', async () => {
    let permissionRan = false
    addTestFunction('scoped', {
      func: async () => 'ok',
      scopes: ['admin'],
      permissions: {
        allow: [
          async () => {
            permissionRan = true
            return true
          },
        ],
      },
    })

    await assert.rejects(
      () => runWithScopes('scoped', { sessionScopes: [] }),
      MissingScopeError
    )
    assert.equal(permissionRan, false)
  })

  // Scopes depend only on the session, so a denied request must never pay to
  // parse or validate its body.
  test('a failing scope short-circuits before the data is evaluated', async () => {
    addTestFunction('scoped', { func: async () => 'ok', scopes: ['admin'] })

    await assert.rejects(
      () =>
        runWithScopes('scoped', {
          sessionScopes: [],
          data: () => {
            throw new Error('data should not have been evaluated')
          },
        }),
      MissingScopeError
    )
  })

  test('fails closed when there is no session at all', async () => {
    addTestFunction('scoped', { func: async () => 'ok', scopes: ['admin'] })

    await assert.rejects(
      () =>
        runPikkuFunc('rpc', Math.random().toString(), 'scoped', {
          singletonServices: mockSingletonServices,
          data: () => ({}),
          auth: false,
          wire: {},
        }),
      MissingScopeError
    )
  })
})
