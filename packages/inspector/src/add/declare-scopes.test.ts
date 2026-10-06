import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'
import { flattenScopeDefinitions } from '@pikku/core/scope'

type Critical = { code: ErrorCode; message: string }

const makeLogger = (criticals: Critical[]) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }) => criticals.push({ code, message }),
    critical: (code: ErrorCode, message: string) =>
      criticals.push({ code, message }),
    hasCriticalErrors: () => criticals.length > 0,
  }) satisfies InspectorLogger

const ROLE = [
  "import { defineSystemRole } from '@pikku/core/role'",
  "defineSystemRole({ operator: { scopes: ['pikku:console'] } })",
]

/** An installed `@pikku/addon-console` whose metadata declares the console tree. */
const installConsoleAddon = async (rootDir: string) => {
  const pkgDir = join(rootDir, 'node_modules', '@pikku', 'addon-console')
  const pikkuDir = join(pkgDir, '.pikku')
  await mkdir(join(pikkuDir, 'function'), { recursive: true })
  await mkdir(join(pikkuDir, 'scopes'), { recursive: true })
  await writeFile(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: '@pikku/addon-console', version: '1.0.0' })
  )
  await writeFile(
    join(pikkuDir, 'function', 'pikku-functions-meta.gen.json'),
    JSON.stringify({})
  )
  await writeFile(
    join(pikkuDir, 'scopes', 'pikku-scopes-meta.gen.json'),
    JSON.stringify({
      pikku: {
        name: 'pikku',
        description: 'from the addon',
        scopes: {
          console: { scopes: { secrets: { scopes: { read: {} } } } },
        },
      },
    })
  )
}

const run = async (lines: string[], opts: { addon?: boolean } = {}) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-declare-scopes-'))
  const file = join(rootDir, 'app.ts')
  await writeFile(file, lines.join('\n'))
  await writeFile(join(rootDir, 'package.json'), '{"name":"host"}')
  if (opts.addon) await installConsoleAddon(rootDir)
  const criticals: Critical[] = []
  try {
    const state = await inspect(makeLogger(criticals), [file], { rootDir })
    return { state, criticals }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const ids = (state: Awaited<ReturnType<typeof run>>['state']) =>
  flattenScopeDefinitions(state.scopes.definitions).map((s) => s.id)

describe('declareScopes', () => {
  test('a role grant of an undeclared scope is still refused', async () => {
    const { criticals } = await run(ROLE)
    assert.ok(
      criticals.some(
        (c) =>
          c.code === ErrorCode.INVALID_VALUE &&
          c.message.includes("'pikku:console'")
      ),
      JSON.stringify(criticals)
    )
  })

  test('declareScopes lets a role grant pikku:console with no addon wired', async () => {
    const { state, criticals } = await run([
      "import { declareScopes } from '@pikku/core/scope'",
      "declareScopes(['pikku:console'])",
      ...ROLE,
    ])
    assert.deepEqual(criticals, [])
    assert.ok(ids(state).includes('pikku:console'))
    // Nothing wires the addon, so no unit can pick it up.
    assert.equal(state.rpc.wireAddonDeclarations.size, 0)
  })

  test('wiring the addon alone declares the tree, and adding declareScopes changes nothing', async () => {
    const wire = [
      "import { wireAddon } from '@pikku/core/addon'",
      "wireAddon({ name: 'console', package: '@pikku/addon-console', scopes: ['pikku:console'] })",
    ]
    const wired = await run([...wire, ...ROLE], { addon: true })
    assert.deepEqual(wired.criticals, [])
    assert.equal(wired.state.rpc.wireAddonDeclarations.size, 1)

    const both = await run(
      [
        "import { declareScopes } from '@pikku/core/scope'",
        "declareScopes(['pikku:console'])",
        ...wire,
        ...ROLE,
      ],
      { addon: true }
    )
    assert.deepEqual(both.criticals, [])
    // The addon's tree and description win; the bare id adds nothing.
    assert.deepEqual(ids(both.state), ids(wired.state))
    assert.equal(
      both.state.scopes.definitions[0]!.description,
      'from the addon'
    )
  })

  test('rejects non-literal ids', async () => {
    const { criticals } = await run([
      "import { declareScopes } from '@pikku/core/scope'",
      'declareScopes([someVar])',
    ])
    assert.ok(criticals.some((c) => c.code === ErrorCode.NON_LITERAL_WIRE_NAME))
  })
})
