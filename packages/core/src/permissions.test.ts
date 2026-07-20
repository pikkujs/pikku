import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import {
  addGlobalPermission,
  runPermissions,
  clearPermissionsCache,
  checkAuthPermissions,
} from './permissions.js'
import { resetPikkuState } from './pikku-state.js'
import { pikkuAuth } from './function/functions.types.js'
import type { CoreServices, CoreUserSession } from './types/core.types.js'
import type { CorePermissionGroup } from './function/functions.types.js'

beforeEach(() => {
  resetPikkuState()
  clearPermissionsCache()
})

const mockServices: CoreServices = {
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
} as any

const mockSession: CoreUserSession = { userId: 'test-user' } as any

const run = (opts: {
  funcPermissions?: CorePermissionGroup | any[]
  data?: any
  wire?: any
  packageName?: string | null
}) =>
  runPermissions({
    funcPermissions: opts.funcPermissions,
    services: mockServices,
    wire: (opts.wire ?? { session: mockSession }) as any,
    data: opts.data ?? {},
    packageName: opts.packageName ?? null,
  })

describe('runPermissions — function permissions (OR gate)', () => {
  test('passes when no permissions are defined', async () => {
    await run({})
  })

  test('passes when at least one group is satisfied (OR)', async () => {
    await run({
      funcPermissions: {
        owner: [async () => false],
        admin: [async () => true],
      },
    })
  })

  test('throws when every group fails', async () => {
    await assert.rejects(
      run({
        funcPermissions: {
          owner: [async () => false],
          admin: [async () => false],
        },
      }),
      { message: 'Permission denied' }
    )
  })

  test('ANDs the entries within a single branch array', async () => {
    await assert.rejects(
      run({ funcPermissions: { grp: [async () => true, async () => false] } }),
      { message: 'Permission denied' }
    )
    await run({ funcPermissions: { grp: [async () => true, async () => true] } })
  })

  test('accepts a bare permission array as a single AND branch', async () => {
    await run({ funcPermissions: [async () => true] })
    await assert.rejects(run({ funcPermissions: [async () => false] }), {
      message: 'Permission denied',
    })
  })

  test('passes request data and wire through to permission functions', async () => {
    let received: any
    const wire = { session: mockSession }
    const data = { hello: 'world' }
    await run({
      funcPermissions: {
        grp: [
          async (services: any, d: any, w: any) => {
            received = { services, d, w }
            return true
          },
        ],
      },
      data,
      wire,
    })
    assert.equal(received.services, mockServices)
    assert.equal(received.d, data)
    assert.equal(received.w, wire)
  })
})

describe('runPermissions — global permissions (AND gate)', () => {
  test('requires every registered global to pass', async () => {
    addGlobalPermission([async () => true])
    await run({})

    resetPikkuState()
    clearPermissionsCache()
    addGlobalPermission([async () => false])
    await assert.rejects(run({}), { message: 'Permission denied' })
  })

  test('ANDs multiple registered globals', async () => {
    addGlobalPermission([async () => true])
    addGlobalPermission([async () => false])
    await assert.rejects(run({}), { message: 'Permission denied' })
  })

  test('a global group entry ORs internally but must still pass', async () => {
    addGlobalPermission({
      a: [async () => false],
      b: [async () => true],
    } as CorePermissionGroup)
    await run({})
  })
})

describe('runPermissions — gates are independent (no escalation)', () => {
  test('a passing global does NOT satisfy a failing function permission', async () => {
    // The classic escalation bug: a broad global must not grant an admin-only fn.
    addGlobalPermission([async () => true])
    await assert.rejects(
      run({ funcPermissions: { admin: [async () => false] } }),
      { message: 'Permission denied' }
    )
  })

  test('a passing function permission does NOT bypass a failing global', async () => {
    addGlobalPermission([async () => false])
    await assert.rejects(
      run({ funcPermissions: { anyone: [async () => true] } }),
      { message: 'Permission denied' }
    )
  })

  test('passes only when both gates pass', async () => {
    addGlobalPermission([async () => true])
    await run({ funcPermissions: { admin: [async () => true] } })
  })
})

describe('runPermissions — package isolation', () => {
  test('globals are scoped per package', async () => {
    addGlobalPermission([async () => false], 'pkg-a')
    // A different package sees no globals, so it passes.
    await run({ packageName: 'pkg-b' })
    // The registering package is gated.
    await assert.rejects(run({ packageName: 'pkg-a' }), {
      message: 'Permission denied',
    })
  })
})

describe('checkAuthPermissions', () => {
  test('returns true when there are no auth predicates', async () => {
    assert.equal(
      await checkAuthPermissions(undefined, mockSession, mockServices),
      true
    )
  })

  test('honours a global pikkuAuth predicate at filter time', async () => {
    addGlobalPermission([pikkuAuth(async () => false)])
    assert.equal(
      await checkAuthPermissions(undefined, mockSession, mockServices),
      false
    )

    resetPikkuState()
    clearPermissionsCache()
    addGlobalPermission([pikkuAuth(async () => true)])
    assert.equal(
      await checkAuthPermissions(undefined, mockSession, mockServices),
      true
    )
  })

  test('evaluates a live pikkuAuth predicate from the config group', async () => {
    assert.equal(
      await checkAuthPermissions(
        { admin: pikkuAuth(async () => false) as any },
        mockSession,
        mockServices
      ),
      false
    )
    assert.equal(
      await checkAuthPermissions(
        { admin: pikkuAuth(async () => true) as any },
        mockSession,
        mockServices
      ),
      true
    )
  })

  test('ignores data-dependent permissions (no auth marker)', async () => {
    // A bare pikkuPermission carries no __pikkuAuth brand, so it cannot be
    // evaluated at filter time and must not gate the tool list.
    assert.equal(
      await checkAuthPermissions(
        { ownsRow: (async () => false) as any },
        mockSession,
        mockServices
      ),
      true
    )
  })
})
