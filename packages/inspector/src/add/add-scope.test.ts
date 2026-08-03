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

/** Inspects several files at once, keyed by basename. */
const inspectSources = async (sources: Record<string, string>) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-scope-multi-'))
  const files: Record<string, string> = {}
  for (const [name, source] of Object.entries(sources)) {
    files[name] = join(rootDir, name)
    await writeFile(files[name]!, source)
  }
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  try {
    const state = await inspect(makeLogger(criticals), Object.values(files), {
      rootDir,
    })
    return { state, criticals, files }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('addScope inspector', () => {
  test('extracts a flat scope', async () => {
    const { state, criticals } = await inspectSource(
      [
        "import { defineScope } from '@pikku/core/scope'",
        'defineScope({',
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

  test('extracts a displayName at every depth', async () => {
    const { state, criticals } = await inspectSource(
      [
        "import { defineScope } from '@pikku/core/scope'",
        'defineScope({',
        '  admin: {',
        "    displayName: 'Administration',",
        '    scopes: {',
        '      invoices: {',
        "        displayName: 'Invoice Management',",
        '        scopes: {',
        "          create: { displayName: 'Create Invoices' },",
        '        },',
        '      },',
        '    },',
        '  },',
        '})',
      ].join('\n')
    )

    assert.equal(criticals.length, 0)
    const admin = state.scopes.definitions[0]!
    assert.equal(admin.displayName, 'Administration')
    const invoices = admin.scopes!.invoices!
    assert.equal(invoices.displayName, 'Invoice Management')
    assert.equal(invoices.scopes!.create!.displayName, 'Create Invoices')
  })

  test('extracts a nested scope tree', async () => {
    const { state, criticals } = await inspectSource(
      [
        "import { defineScope } from '@pikku/core/scope'",
        'defineScope({',
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
        "import { defineScope } from '@pikku/core/scope'",
        'defineScope({ admin: {} })',
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
        "import { defineScope } from '@pikku/core/scope'",
        'defineScope({ admin: {}, billing: { scopes: { read: {} } } })',
      ].join('\n')
    )

    assert.equal(criticals.length, 0)
    assert.deepEqual(
      state.scopes.definitions.map((d) => d.name),
      ['admin', 'billing']
    )
    assert.deepEqual(state.scopes.definitions[1]!.scopes, { read: {} })
  })

  // One call site per codebase, so there is one place to read the scopes from
  // and one place to add to. The keyed form above is how you declare more.
  test('a second defineScope in the same file is refused', async () => {
    const { state, criticals } = await inspectSource(
      [
        "import { defineScope } from '@pikku/core/scope'",
        'defineScope({ admin: {} })',
        'defineScope({ billing: {} })',
      ].join('\n')
    )

    const hit = criticals.find(
      (c) => c.code === ErrorCode.DUPLICATE_SCOPE_DEFINITION
    )
    assert.ok(
      hit,
      `expected DUPLICATE_SCOPE_DEFINITION, got ${JSON.stringify(criticals)}`
    )
    assert.deepEqual(
      state.scopes.definitions.map((d) => d.name),
      ['admin']
    )
  })

  test('a second defineScope in another file is refused', async () => {
    const { criticals, files } = await inspectSources({
      'scopes.ts': [
        "import { defineScope } from '@pikku/core/scope'",
        'defineScope({ admin: {} })',
      ].join('\n'),
      'more-scopes.ts': [
        "import { defineScope } from '@pikku/core/scope'",
        'defineScope({ billing: {} })',
      ].join('\n'),
    })

    const hit = criticals.find(
      (c) => c.code === ErrorCode.DUPLICATE_SCOPE_DEFINITION
    )
    assert.ok(
      hit,
      `expected DUPLICATE_SCOPE_DEFINITION, got ${JSON.stringify(criticals)}`
    )
    assert.ok(
      hit!.message.includes(files['scopes.ts']!) &&
        hit!.message.includes(files['more-scopes.ts']!),
      `expected both files named, got ${hit!.message}`
    )
  })

  test('is critical when a root embeds the separator', async () => {
    const { criticals } = await inspectSource(
      [
        "import { defineScope } from '@pikku/core/scope'",
        "defineScope({ 'admin:users': {} })",
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
        "import { defineScope } from '@pikku/core/scope'",
        "defineScope({ '*': {} })",
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
        "import { defineScope } from '@pikku/core/scope'",
        'const k = String(1)',
        'defineScope({ [k]: {} } as any)',
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
        "import { defineScope } from '@pikku/core/scope'",
        "defineScope({ admin: 'nope' } as any)",
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
      "import { defineScope } from '@pikku/core/scope'",
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
        'defineScope({',
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
        'defineScope({',
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
      funcSource("['billing:read']", ['defineScope({ admin: {} })'])
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
      funcSource("['nope']", ['defineScope({ admin: {} })'])
    )

    assert.ok(
      criticals.some((c) => c.message.includes('Available scopes: admin')),
      `expected the message to list available scopes, got ${JSON.stringify(criticals)}`
    )
  })

  test('rejects a typo in a nested scope', async () => {
    const { criticals } = await inspectSource(
      funcSource("['admin:invoice:create']", [
        'defineScope({',
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
      funcSource("['admin:*']", ['defineScope({ admin: {} })'])
    )

    assert.deepEqual(criticals, [])
  })

  test('rejects a wildcard requirement whose node is undeclared', async () => {
    const { criticals } = await inspectSource(
      funcSource("['billing:*']", ['defineScope({ admin: {} })'])
    )

    assert.ok(
      criticals.some((c) => c.message.includes('billing:*')),
      `expected a critical for billing:*, got ${JSON.stringify(criticals)}`
    )
  })

  test('rejects a bare wildcard requirement', async () => {
    const { criticals } = await inspectSource(
      funcSource("['*']", ['defineScope({ admin: {} })'])
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
