import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = (criticals: Array<{ code: ErrorCode; message: string }>) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }) => {
      criticals.push({ code, message })
    },
    critical: (code: ErrorCode, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }) satisfies InspectorLogger

const inspectSource = async (source: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-role-'))
  const file = join(rootDir, 'roles.ts')
  await writeFile(file, source)
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  try {
    const state = await inspect(makeLogger(criticals), [file], { rootDir })
    return { state, criticals, file }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const IMPORTS = [
  "import { defineScope } from '@pikku/core/scope'",
  "import { defineSystemRole } from '@pikku/core/role'",
]

const withScopes = (...lines: string[]) =>
  [
    ...IMPORTS,
    'defineScope({',
    '  catalogue: { scopes: { read: {} } },',
    '  orders: { scopes: { create: {} } },',
    '  admin: { scopes: { users: { scopes: { ban: {} } } } },',
    '})',
    ...lines,
  ].join('\n')

describe('addSystemRole inspector', () => {
  test('extracts a role with its scopes', async () => {
    const { state, criticals } = await inspectSource(
      withScopes(
        'defineSystemRole({',
        '  buyer: {',
        "    displayName: 'Buyer',",
        "    description: 'Browses and orders',",
        "    scopes: ['catalogue:read', 'orders:create'],",
        '  },',
        '})'
      )
    )

    assert.deepEqual(criticals, [])
    assert.equal(state.systemRoles.definitions.length, 1)
    const role = state.systemRoles.definitions[0]!
    assert.equal(role.name, 'buyer')
    assert.equal(role.displayName, 'Buyer')
    assert.equal(role.description, 'Browses and orders')
    assert.deepEqual(role.scopes, ['catalogue:read', 'orders:create'])
  })

  test('extracts several roles from one call', async () => {
    const { state, criticals } = await inspectSource(
      withScopes(
        'defineSystemRole({',
        "  buyer: { scopes: ['catalogue:read'] },",
        "  admin: { scopes: ['admin'] },",
        '})'
      )
    )

    assert.deepEqual(criticals, [])
    assert.deepEqual(
      state.systemRoles.definitions.map((r) => r.name),
      ['buyer', 'admin']
    )
  })

  test('a role granting nothing is legitimate, said explicitly', async () => {
    const { state, criticals } = await inspectSource(
      withScopes('defineSystemRole({', '  guest: { scopes: [] },', '})')
    )

    assert.deepEqual(criticals, [])
    assert.deepEqual(state.systemRoles.definitions[0]!.scopes, [])
  })

  // Omitting `scopes` is not the same as declaring none — one is a decision,
  // the other is a role nobody finished writing.
  test('omitting scopes entirely is refused', async () => {
    const { state, criticals } = await inspectSource(
      withScopes('defineSystemRole({', "  guest: { description: 'x' },", '})')
    )

    assert.equal(state.systemRoles.definitions.length, 0)
    assert.ok(criticals.some((c) => /has no 'scopes'/.test(c.message)))
  })

  test('a name containing the scope separator is refused', async () => {
    const { state, criticals } = await inspectSource(
      withScopes('defineSystemRole({', "  'admin:users': { scopes: [] },", '})')
    )

    assert.equal(state.systemRoles.definitions.length, 0)
    assert.ok(criticals.some((c) => /separator/.test(c.message)))
  })

  // Scopes are read by AST, so a computed entry cannot be checked against the
  // declared set — accepting it silently would let a role grant anything.
  test('a computed scope entry is refused', async () => {
    const { criticals } = await inspectSource(
      withScopes(
        'const s = "catalogue:read"',
        'defineSystemRole({',
        '  buyer: { scopes: [s] },',
        '})'
      )
    )

    assert.ok(criticals.some((c) => /not a string literal/.test(c.message)))
  })

  test('`as const` does not hide the declaration', async () => {
    const { state, criticals } = await inspectSource(
      withScopes(
        'defineSystemRole({',
        "  buyer: { scopes: ['catalogue:read'] },",
        '} as const)'
      )
    )

    assert.deepEqual(criticals, [])
    assert.equal(state.systemRoles.definitions.length, 1)
  })
})

describe('validateSystemRoleScopes', () => {
  test('accepts declared scopes, including an intermediate node', async () => {
    const { criticals } = await inspectSource(
      withScopes(
        'defineSystemRole({',
        "  admin: { scopes: ['admin', 'admin:users:ban'] },",
        '})'
      )
    )

    assert.deepEqual(criticals, [])
  })

  test('accepts a subtree wildcard whose node exists', async () => {
    const { criticals } = await inspectSource(
      withScopes(
        'defineSystemRole({',
        "  admin: { scopes: ['admin:*'] },",
        '})'
      )
    )

    assert.deepEqual(criticals, [])
  })

  // The failure this exists to prevent: no function checks `orders:refund`, so
  // a persona holding the role passes every call and the boundary the role
  // describes is never exercised.
  test('an undeclared scope fails the build and lists what is available', async () => {
    const { criticals } = await inspectSource(
      withScopes(
        'defineSystemRole({',
        "  buyer: { scopes: ['orders:refund'] },",
        '})'
      )
    )

    const critical = criticals.find((c) => /orders:refund/.test(c.message))
    assert.ok(critical, `expected a critical, got ${JSON.stringify(criticals)}`)
    assert.match(critical!.message, /is not declared/)
    assert.match(critical!.message, /catalogue:read/)
  })

  test('a subtree wildcard on an undeclared node fails', async () => {
    const { criticals } = await inspectSource(
      withScopes(
        'defineSystemRole({',
        "  buyer: { scopes: ['nonsense:*'] },",
        '})'
      )
    )

    assert.ok(criticals.some((c) => /nonsense:\*/.test(c.message)))
  })

  test('the bare wildcard is refused — it hides what the role confers', async () => {
    const { criticals } = await inspectSource(
      withScopes('defineSystemRole({', "  god: { scopes: ['*'] },", '})')
    )

    assert.ok(criticals.some((c) => /bare wildcard/.test(c.message)))
  })
})
