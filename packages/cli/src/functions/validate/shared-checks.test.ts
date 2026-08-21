import assert from 'node:assert'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  betterAuthTableAliases,
  migrationCreatesTable,
  readJsonSafe,
  staticStubbedImports,
} from './shared-checks.js'

const AUTH_CONFIG = `
  export const auth = betterAuth({
    database: { dialect, type: 'sqlite' },
    user: {
      modelName: 'authUser',
      additionalFields: { role: { type: 'string' } },
    },
    session: {
      modelName: 'authSession',
      cookieCache: { enabled: true },
    },
    account: { modelName: 'authAccount' },
    verification: { modelName: 'authVerification' },
  })
`

describe('betterAuthTableAliases', () => {
  test('is the default name alone when nothing renames the model', () => {
    assert.deepStrictEqual(betterAuthTableAliases('user', ''), ['user'])
  })

  test('adds the override and its snake_case form', () => {
    assert.deepStrictEqual(betterAuthTableAliases('user', AUTH_CONFIG), [
      'user',
      'authUser',
      'auth_user',
    ])
  })

  test('resolves a model declared after a nested option block', () => {
    assert.deepStrictEqual(betterAuthTableAliases('session', AUTH_CONFIG), [
      'session',
      'authSession',
      'auth_session',
    ])
  })

  test('finds the renamed table in a migration', () => {
    const sql = 'CREATE TABLE IF NOT EXISTS "auth_verification" ("id" TEXT)'
    const aliases = betterAuthTableAliases('verification', AUTH_CONFIG)
    assert.ok(aliases.some((name) => migrationCreatesTable(sql, name)))
    assert.ok(!migrationCreatesTable(sql, 'verification'))
  })
})

describe('staticStubbedImports', () => {
  test('reports a named import of a stubbed package', () => {
    const found = staticStubbedImports(
      "import { VercelAgentRunner } from '@pikku/ai-vercel'"
    )
    assert.deepStrictEqual(found, [
      { module: '@pikku/ai-vercel', service: 'agentRunner' },
    ])
  })

  test('reports every stubbed package in the file', () => {
    const found = staticStubbedImports(
      [
        "import { VercelAgentRunner } from '@pikku/ai-vercel'",
        "import { createOpenAI } from '@ai-sdk/openai'",
        "import { Kysely } from 'kysely'",
      ].join('\n')
    )
    assert.deepStrictEqual(
      found.map((f) => f.module),
      ['@pikku/ai-vercel', '@ai-sdk/openai']
    )
  })

  test('ignores a type-only import', () => {
    assert.deepStrictEqual(
      staticStubbedImports(
        "import type { VercelAgentRunner } from '@pikku/ai-vercel'"
      ),
      []
    )
  })

  test('ignores a named clause whose bindings are all types', () => {
    assert.deepStrictEqual(
      staticStubbedImports(
        "import { type VercelAgentRunner, type AgentStep } from '@pikku/ai-vercel'"
      ),
      []
    )
  })

  test('ignores a dynamic import', () => {
    assert.deepStrictEqual(
      staticStubbedImports("const aiVercel = await import('@pikku/ai-vercel')"),
      []
    )
  })

  test('ignores a package the bundler never stubs', () => {
    assert.deepStrictEqual(
      staticStubbedImports("import { Kysely } from 'kysely'"),
      []
    )
  })

  test('does not confuse a package that merely starts with ai', () => {
    assert.deepStrictEqual(
      staticStubbedImports("import { thing } from 'airtable'"),
      []
    )
  })
})

describe('readJsonSafe', () => {
  let dir: string
  const write = async (name: string, body: string) => {
    const path = join(dir, name)
    await writeFile(path, body)
    return path
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pikku-read-json-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('reads a tsconfig written as JSONC', async () => {
    const path = await write(
      'tsconfig.json',
      `{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    // "bun" as well as "node": the API runs on bun and imports \`bun:sqlite\`.
    "types": ["node", "bun"],
    "noEmit": true
  },
  /* tests are listed explicitly rather than pulled in transitively. */
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}`
    )

    const config = await readJsonSafe<{
      compilerOptions?: { types?: string[] }
      include?: string[]
    }>(path)

    assert.deepStrictEqual(config?.compilerOptions?.types, ['node', 'bun'])
    assert.deepStrictEqual(config?.include, ['src/**/*.ts', 'tests/**/*.ts'])
  })

  test('a trailing comma is not a parse failure', async () => {
    const path = await write('a.json', '{ "a": [1, 2,], "b": 3, }')
    assert.deepStrictEqual(await readJsonSafe(path), { a: [1, 2], b: 3 })
  })

  test('comment-like text inside a string survives', async () => {
    const path = await write(
      'b.json',
      '{ "url": "https://example.com/x", "glob": "src/**/*.ts" }'
    )
    assert.deepStrictEqual(await readJsonSafe(path), {
      url: 'https://example.com/x',
      glob: 'src/**/*.ts',
    })
  })

  test('a genuinely malformed file is still named', async () => {
    const path = await write('c.json', '{ "a": }')
    await assert.rejects(() => readJsonSafe(path), /Invalid JSON in .*c\.json/)
  })

  test('a missing file is null, not a throw', async () => {
    assert.strictEqual(await readJsonSafe(join(dir, 'gone.json')), null)
  })
})
