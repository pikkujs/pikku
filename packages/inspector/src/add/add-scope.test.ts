import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
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
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-scope-'))
  const file = join(rootDir, 'scopes.ts')
  await writeFile(file, source)
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  try {
    const state = await inspect(makeLogger(criticals), [file], { rootDir })
    return { state, criticals, file }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('addScope inspector', () => {
  test('extracts a flat scope', async () => {
    const { state, criticals } = await inspectSource(
      [
        "import { wireScope } from '@pikku/core/scope'",
        'wireScope({',
        '  admin: {',
        "    displayName: 'Administration',",
        "    description: 'Administrative access',",
        '  },',
        '})',
      ].join('\n')
    )

    assert.equal(criticals.length, 0)
    assert.equal(state.scopes.definitions.length, 1)
    assert.equal(state.scopes.definitions[0]!.name, 'admin')
    assert.equal(state.scopes.definitions[0]!.displayName, 'Administration')
    assert.equal(
      state.scopes.definitions[0]!.description,
      'Administrative access'
    )
  })

  test('extracts a nested scope tree', async () => {
    const { state, criticals } = await inspectSource(
      [
        "import { wireScope } from '@pikku/core/scope'",
        'wireScope({',
        '  admin: {',
        '    scopes: {',
        '      invoices: {',
        "        description: 'Invoice management',",
        '        scopes: {',
        "          create: { description: 'Create invoices' },",
        '        },',
        '      },',
        '    },',
        '  },',
        '})',
      ].join('\n')
    )

    assert.equal(criticals.length, 0)
    assert.deepEqual(state.scopes.definitions[0]!.scopes, {
      invoices: {
        description: 'Invoice management',
        scopes: {
          create: { description: 'Create invoices' },
        },
      },
    })
  })

  test('records the source file', async () => {
    const { state, file } = await inspectSource(
      [
        "import { wireScope } from '@pikku/core/scope'",
        'wireScope({ admin: {} })',
      ].join('\n')
    )

    assert.equal(state.scopes.definitions[0]!.sourceFile, file)
    assert.ok(state.scopes.files.has(file))
  })

  // The point of the keyed form: one call declares as many roots as you like,
  // and a root reads exactly like the nodes beneath it.
  test('extracts several roots from one declaration', async () => {
    const { state, criticals } = await inspectSource(
      [
        "import { wireScope } from '@pikku/core/scope'",
        'wireScope({ admin: {}, billing: { scopes: { read: {} } } })',
      ].join('\n')
    )

    assert.equal(criticals.length, 0)
    assert.deepEqual(
      state.scopes.definitions.map((d) => d.name),
      ['admin', 'billing']
    )
    assert.deepEqual(state.scopes.definitions[1]!.scopes, { read: {} })
  })

  test('extracts several declarations', async () => {
    const { state } = await inspectSource(
      [
        "import { wireScope } from '@pikku/core/scope'",
        'wireScope({ admin: {} })',
        'wireScope({ billing: {} })',
      ].join('\n')
    )

    assert.deepEqual(
      state.scopes.definitions.map((d) => d.name),
      ['admin', 'billing']
    )
  })

  test('is critical when a root embeds the separator', async () => {
    const { criticals } = await inspectSource(
      [
        "import { wireScope } from '@pikku/core/scope'",
        "wireScope({ 'admin:users': {} })",
      ].join('\n')
    )

    assert.ok(
      criticals.some((c) => c.code === ErrorCode.INVALID_VALUE),
      `expected an INVALID_VALUE critical, got ${JSON.stringify(criticals)}`
    )
  })

  test('is critical when a root is the wildcard', async () => {
    const { criticals } = await inspectSource(
      [
        "import { wireScope } from '@pikku/core/scope'",
        "wireScope({ '*': {} })",
      ].join('\n')
    )

    assert.ok(
      criticals.some((c) => c.code === ErrorCode.INVALID_VALUE),
      `expected an INVALID_VALUE critical, got ${JSON.stringify(criticals)}`
    )
  })

  test('is critical when a root key is not a literal', async () => {
    const { criticals } = await inspectSource(
      [
        "import { wireScope } from '@pikku/core/scope'",
        'const k = String(1)',
        'wireScope({ [k]: {} } as any)',
      ].join('\n')
    )

    assert.ok(
      criticals.some((c) => c.code === ErrorCode.NON_LITERAL_WIRE_NAME),
      `expected a NON_LITERAL_WIRE_NAME critical, got ${JSON.stringify(criticals)}`
    )
  })

  test('is critical when a root is not an object literal', async () => {
    const { criticals } = await inspectSource(
      [
        "import { wireScope } from '@pikku/core/scope'",
        "wireScope({ admin: 'nope' } as any)",
      ].join('\n')
    )

    assert.ok(
      criticals.some((c) => c.code === ErrorCode.INVALID_VALUE),
      `expected an INVALID_VALUE critical, got ${JSON.stringify(criticals)}`
    )
  })
})

describe('validateScopeReferences', () => {
  const funcSource = (scopes: string, decls: string[] = []) =>
    [
      "import { wireScope } from '@pikku/core/scope'",
      "import { pikkuSessionlessFunc } from '@pikku/core'",
      ...decls,
      'export const f = pikkuSessionlessFunc({',
      `  scopes: ${scopes},`,
      "  func: async () => 'ok',",
      '})',
    ].join('\n')

  test('accepts a declared scope', async () => {
    const { criticals } = await inspectSource(
      funcSource("['admin:invoices:create']", [
        'wireScope({',
        '  admin: {',
        '    scopes: { invoices: { scopes: { create: {} } } },',
        '  },',
        '})',
      ])
    )

    assert.deepEqual(criticals, [])
  })

  test('accepts an intermediate node of a declared tree', async () => {
    const { criticals } = await inspectSource(
      funcSource("['admin:invoices']", [
        'wireScope({',
        '  admin: {',
        '    scopes: { invoices: { scopes: { create: {} } } },',
        '  },',
        '})',
      ])
    )

    assert.deepEqual(criticals, [])
  })

  test('rejects an undeclared scope', async () => {
    const { criticals } = await inspectSource(
      funcSource("['billing:read']", ['wireScope({ admin: {} })'])
    )

    assert.ok(
      criticals.some(
        (c) =>
          c.code === ErrorCode.INVALID_VALUE &&
          c.message.includes('billing:read')
      ),
      `expected an INVALID_VALUE critical for billing:read, got ${JSON.stringify(criticals)}`
    )
  })

  test('lists the available scopes when one is undeclared', async () => {
    const { criticals } = await inspectSource(
      funcSource("['nope']", ['wireScope({ admin: {} })'])
    )

    assert.ok(
      criticals.some((c) => c.message.includes('Available scopes: admin')),
      `expected the message to list available scopes, got ${JSON.stringify(criticals)}`
    )
  })

  test('rejects a typo in a nested scope', async () => {
    const { criticals } = await inspectSource(
      funcSource("['admin:invoice:create']", [
        'wireScope({',
        '  admin: {',
        '    scopes: { invoices: { scopes: { create: {} } } },',
        '  },',
        '})',
      ])
    )

    assert.ok(
      criticals.some((c) => c.message.includes('admin:invoice:create')),
      `expected a critical for the typo, got ${JSON.stringify(criticals)}`
    )
  })

  test('accepts a wildcard requirement whose node is declared', async () => {
    const { criticals } = await inspectSource(
      funcSource("['admin:*']", ['wireScope({ admin: {} })'])
    )

    assert.deepEqual(criticals, [])
  })

  test('rejects a wildcard requirement whose node is undeclared', async () => {
    const { criticals } = await inspectSource(
      funcSource("['billing:*']", ['wireScope({ admin: {} })'])
    )

    assert.ok(
      criticals.some((c) => c.message.includes('billing:*')),
      `expected a critical for billing:*, got ${JSON.stringify(criticals)}`
    )
  })

  test('rejects a bare wildcard requirement', async () => {
    const { criticals } = await inspectSource(
      funcSource("['*']", ['wireScope({ admin: {} })'])
    )

    assert.ok(
      criticals.some((c) => c.message.includes('bare wildcard')),
      `expected a critical for the bare wildcard, got ${JSON.stringify(criticals)}`
    )
  })

  test('is silent for a function declaring no scopes', async () => {
    const { criticals } = await inspectSource(
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        "export const f = pikkuSessionlessFunc({ func: async () => 'ok' })",
      ].join('\n')
    )

    assert.deepEqual(criticals, [])
  })
})
