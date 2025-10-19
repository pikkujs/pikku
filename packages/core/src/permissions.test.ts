import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import {
  addPermission,
  getPermissionsForTags,
  runPermissions,
} from './permissions.js'
import { resetPikkuState } from './pikku-state.js'
import {
  CoreServices,
  CoreUserSession,
  PikkuWiringTypes,
} from './types/core.types.js'
import { CorePermissionGroup } from './function/functions.types.js'

beforeEach(() => {
  resetPikkuState()
})

const mockServices: CoreServices = {
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
} as any

const mockSession: CoreUserSession = {
  userId: 'test-user',
} as any

describe('addPermission', () => {
  test('should add single permission for a tag', () => {
    const mockPermission = async () => true

    addPermission('testTag', [mockPermission])

    const permissions = getPermissionsForTags(['testTag'])
    assert.equal(permissions.length, 1)
    assert.equal(permissions[0], mockPermission)
  })

  test('should add multiple permissions for a tag', () => {
    const mockPermission1 = async () => true
    const mockPermission2 = async () => false

    addPermission('multiTestTag', [mockPermission1, mockPermission2])

    const permissions = getPermissionsForTags(['multiTestTag'])
    assert.equal(permissions.length, 2)
    assert.equal(permissions[0], mockPermission1)
    assert.equal(permissions[1], mockPermission2)
  })

  test('should add permission group object for a tag', () => {
    const mockPermissionGroup: CorePermissionGroup = {
      permissions: [async () => true, async () => false],
    }

    addPermission('groupTestTag', mockPermissionGroup)

    const permissions = getPermissionsForTags(['groupTestTag'])
    assert.equal(permissions.length, 1)
    assert.equal(permissions[0], mockPermissionGroup)
  })

  test('should throw error when tag already exists', () => {
    const mockPermission = async () => true

    addPermission('duplicateTag', [mockPermission])

    assert.throws(
      () => {
        addPermission('duplicateTag', [mockPermission])
      },
      {
        message:
          "Permissions for tag 'duplicateTag' already exist. Use a different tag or remove the existing permissions first.",
      }
    )
  })
})

describe('getPermissionsForTags', () => {
  test('should return empty array when no tags provided', () => {
    const permissions = getPermissionsForTags([])
    assert.deepEqual(permissions, [])
  })

  test('should return empty array when tags is undefined', () => {
    const permissions = getPermissionsForTags(undefined)
    assert.deepEqual(permissions, [])
  })

  test('should return permissions for single tag', () => {
    const mockPermission = async () => true
    addPermission('singleTestTag', [mockPermission])

    const permissions = getPermissionsForTags(['singleTestTag'])
    assert.equal(permissions.length, 1)
    assert.equal(permissions[0], mockPermission)
  })

  test('should return permissions for multiple tags', () => {
    const mockPermission1 = async () => true
    const mockPermission2 = async () => false

    addPermission('tag1', [mockPermission1])
    addPermission('tag2', [mockPermission2])

    const permissions = getPermissionsForTags(['tag1', 'tag2'])
    assert.equal(permissions.length, 2)
    assert.equal(permissions[0], mockPermission1)
    assert.equal(permissions[1], mockPermission2)
  })

  test('should handle array permissions correctly', () => {
    const mockPermission1 = async () => true
    const mockPermission2 = async () => false

    addPermission('arrayHandleTestTag', [mockPermission1, mockPermission2])

    const permissions = getPermissionsForTags(['arrayHandleTestTag'])
    assert.equal(permissions.length, 2)
    assert.equal(permissions[0], mockPermission1)
    assert.equal(permissions[1], mockPermission2)
  })

  test('should handle non-array permissions correctly', () => {
    const mockPermissionGroup: CorePermissionGroup = {
      permissions: [async () => true],
    }

    addPermission('objectHandleTestTag', mockPermissionGroup)

    const permissions = getPermissionsForTags(['objectHandleTestTag'])
    assert.equal(permissions.length, 1)
    assert.equal(permissions[0], mockPermissionGroup)
  })

  test('should deduplicate tags', () => {
    const mockPermission = async () => true
    addPermission('dedupeTestTag', [mockPermission])

    const permissions = getPermissionsForTags([
      'dedupeTestTag',
      'dedupeTestTag',
    ])
    assert.equal(permissions.length, 1)
    assert.equal(permissions[0], mockPermission)
  })

  test('should ignore non-existent tags', () => {
    const mockPermission = async () => true
    addPermission('existingTag', [mockPermission])

    const permissions = getPermissionsForTags(['existingTag', 'nonExistentTag'])
    assert.equal(permissions.length, 1)
    assert.equal(permissions[0], mockPermission)
  })
})

describe('runPermissions', () => {
  test('should pass when no permissions are defined', async () => {
    // Should not throw
    await runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
      allServices: mockServices,
      data: {},
      session: mockSession,
    })
  })

  test('should execute wiring tag permissions first', async () => {
    const executionOrder: string[] = []
    const wiringTagPermission = async () => {
      executionOrder.push('wiringTag')
      return true
    }

    addPermission('wiringTag', [wiringTagPermission])

    await runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
      wireInheritedPermissions: [{ type: 'tag', tag: 'wiringTag' }],
      allServices: mockServices,
      data: {},
      session: mockSession,
    })

    assert.deepEqual(executionOrder, ['wiringTag'])
  })

  test('should execute all permission levels in correct order', async () => {
    const executionOrder: string[] = []

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

    const wirePermissions: CorePermissionGroup = {
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

    await runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
      wireInheritedPermissions: [{ type: 'tag', tag: 'wiringTag' }],
      wirePermissions,
      funcInheritedPermissions: [{ type: 'tag', tag: 'funcTag' }],
      funcPermissions,
      allServices: mockServices,
      data: {},
      session: mockSession,
    })

    // Order: wireInheritedPermissions (wiringTag) → wirePermissions → funcInheritedPermissions (funcTag) → funcPermissions
    assert.deepEqual(executionOrder, [
      'wiringTag',
      'wiringPermission',
      'funcTag',
      'funcPermission',
    ])
  })

  test('should implement "at least one must pass" logic for tag permissions', async () => {
    const failingPermission = async () => false
    const passingPermission = async () => true

    addPermission('atLeastOneTestTag', [failingPermission, passingPermission])

    // Should not throw because at least one permission passes
    await runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
      wireInheritedPermissions: [{ type: 'tag', tag: 'atLeastOneTestTag' }],
      allServices: mockServices,
      data: {},
      session: mockSession,
    })
  })

  test('should throw error when all wiring tag permissions fail', async () => {
    const failingPermission1 = async () => false
    const failingPermission2 = async () => false

    addPermission('allFailTestTag', [failingPermission1, failingPermission2])

    await assert.rejects(
      runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
        wireInheritedPermissions: [{ type: 'tag', tag: 'allFailTestTag' }],
        allServices: mockServices,
        data: {},
        session: mockSession,
      }),
      {
        message: 'Permission denied',
      }
    )
  })

  test('should throw error when wiring permissions fail', async () => {
    const wirePermissions: CorePermissionGroup = {
      permissions: [async () => false],
    }

    await assert.rejects(
      runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
        wirePermissions,
        allServices: mockServices,
        data: {},
        session: mockSession,
      }),
      {
        message: 'Permission denied',
      }
    )
  })

  test('should throw error when all function tag permissions fail', async () => {
    const failingPermission = async () => false

    addPermission('funcTag', [failingPermission])

    await assert.rejects(
      runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
        funcInheritedPermissions: [{ type: 'tag', tag: 'funcTag' }],
        allServices: mockServices,
        data: {},
        session: mockSession,
      }),
      {
        message: 'Permission denied',
      }
    )
  })

  test('should throw error when function permissions fail', async () => {
    const funcPermissions: CorePermissionGroup = {
      permissions: [async () => false],
    }

    await assert.rejects(
      runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
        funcPermissions,
        allServices: mockServices,
        data: {},
        session: mockSession,
      }),
      {
        message: 'Permission denied',
      }
    )
  })

  test('should evaluate all permissions and pass if at least one succeeds', async () => {
    const executionOrder: string[] = []

    const failingWiringTagPermission = async () => {
      executionOrder.push('wiringTag')
      return false
    }

    addPermission('failingWiringTag', [failingWiringTagPermission])

    const wirePermissions: CorePermissionGroup = {
      permissions: [
        async () => {
          executionOrder.push('wiringPermission')
          return true
        },
      ],
    }

    // Should NOT throw because at least one permission (wirePermissions) passes
    await runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
      wireInheritedPermissions: [{ type: 'tag', tag: 'failingWiringTag' }],
      wirePermissions,
      allServices: mockServices,
      data: {},
      session: mockSession,
    })

    // Both permissions should be evaluated
    assert.deepEqual(executionOrder, ['wiringTag', 'wiringPermission'])
  })

  test('should handle array permissions in tag-based permissions', async () => {
    const arrayPermission = [async () => true, async () => false]

    addPermission('arrayTestTag', arrayPermission)

    // Should not throw because verifyPermissions handles array properly
    await runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
      wireInheritedPermissions: [{ type: 'tag', tag: 'arrayTestTag' }],
      allServices: mockServices,
      data: {},
      session: mockSession,
    })
  })

  test('should handle permission group objects in tag-based permissions', async () => {
    const permissionGroup: CorePermissionGroup = {
      permissions: [async () => true],
    }

    addPermission('objectTestTag', permissionGroup)

    // Should not throw because verifyPermissions handles objects properly
    await runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
      wireInheritedPermissions: [{ type: 'tag', tag: 'objectTestTag' }],
      allServices: mockServices,
      data: {},
      session: mockSession,
    })
  })

  test('should pass correct parameters to permission functions', async () => {
    let receivedServices: any
    let receivedData: any
    let receivedSession: any

    const testPermission = async (services: any, data: any, session: any) => {
      receivedServices = services
      receivedData = data
      receivedSession = session
      return true
    }

    const testData = { test: 'data' }

    addPermission('paramTestTag', [testPermission])

    await runPermissions(PikkuWiringTypes.rpc, Math.random().toString(), {
      wireInheritedPermissions: [{ type: 'tag', tag: 'paramTestTag' }],
      allServices: mockServices,
      data: testData,
      session: mockSession,
    })

    assert.equal(receivedServices, mockServices)
    assert.equal(receivedData, testData)
    assert.equal(receivedSession, mockSession)
  })
})
