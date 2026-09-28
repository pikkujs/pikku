import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { betterAuth } from 'better-auth'
import { loadSqliteRuntime } from '@pikku/migrator-sql/sqlite'
import { createSqliteKysely } from './sqlite/sqlite-kysely.js'
import { loadAuthOptions, withoutAuthSchemaCheck } from './better-auth-schema.js'

/**
 * A Better Auth 1.7 plugin starts work in `init` and does not wait for it — the
 * OAuth provider behind `@better-auth/mcp` seeds its `oauthResource` rows that
 * way. While the schema is being read that work has nowhere to go: the database
 * it is handed is a throwaway whose auth tables do not exist yet, and on the
 * SQLite path the handle is closed as soon as the options have been read. The
 * seed then rejects with nothing awaiting it, and the default for an unhandled
 * rejection is to terminate the process — so `pikku db generate` died on
 * `database is not open`, from a write the schema derivation never wanted, in a
 * project whose only offence was configuring MCP.
 *
 * Run in a child process on purpose. The failure being guarded against is the
 * runtime tearing the process down, which a test harness cannot observe from
 * inside the process it would be tearing down — `bun test` tracks rejections
 * itself and fails the case before any listener of ours is consulted. The exit
 * code is the only honest witness.
 */
test('reading the schema survives a plugin whose init rejects with nothing awaiting it', () => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-auth-schema-'))
  try {
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'auth.ts'),
      `const PIKKU_BETTER_AUTH = Symbol.for('pikku.betterAuth')
// Marker for the source scan, which looks for pikkuBetterAuth( in the file.
export const auth = Object.assign(
  (_services: unknown) => {
    Promise.reject(new Error('database is not open'))
    return { options: { database: { type: 'sqlite' } } }
  },
  { [PIKKU_BETTER_AUTH]: true }
)
`
    )

    const moduleUrl = resolve(import.meta.dirname, 'better-auth-schema.ts')
    const script = `
const { loadAuthOptions } = await import(${JSON.stringify(moduleUrl)})
const options = await loadAuthOptions({
  rootDir: ${JSON.stringify(root)},
  srcDirectories: ['src'],
  kysely: {},
  logger: { error: (m) => { console.error(m); process.exit(2) } },
})
if (options?.database?.type !== 'sqlite') {
  console.error('expected the options to come back, got ' + JSON.stringify(options))
  process.exit(3)
}
await new Promise((r) => setTimeout(r, 250))
`
    const run = spawnSync(process.execPath, ['--eval', script], {
      encoding: 'utf8',
    })

    assert.equal(
      run.status,
      0,
      `reading the schema exited ${run.status}: ${run.stderr || run.stdout}`
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/**
 * The other half of the promise the guard makes: it borrows the process's
 * unhandled-rejection handling for the length of one call and gives it back.
 *
 * This one runs in-process, because what it checks is observable from here —
 * the listener list before and after — and it reads the options the way `pikku
 * db generate` does rather than re-describing the path. The factory here does
 * not reject: `bun test` claims a rejection before any listener of ours is
 * consulted, so the swallowing half can only be witnessed by the exit code of
 * the child above. What is left is the borrowing, which is what a host notices.
 */
test("a host's own unhandled-rejection listeners survive the read", async () => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-auth-schema-'))
  const host = () => {}
  process.on('unhandledRejection', host)
  try {
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'auth.ts'),
      `const PIKKU_BETTER_AUTH = Symbol.for('pikku.betterAuth')
// Marker for the source scan, which looks for pikkuBetterAuth( in the file.
export const auth = Object.assign(
  (_services: unknown) => ({ options: { database: { type: 'sqlite' } } }),
  { [PIKKU_BETTER_AUTH]: true }
)
`
    )

    const options = await loadAuthOptions({
      rootDir: root,
      srcDirectories: ['src'],
      kysely: {} as never,
      logger: { error: () => {} } as never,
    })

    assert.equal(
      (options as { database?: { type?: string } })?.database?.type,
      'sqlite'
    )
    assert.ok(
      process.listeners('unhandledRejection').includes(host),
      'the listener the host had before the call is gone after it'
    )
  } finally {
    process.off('unhandledRejection', host)
    rmSync(root, { recursive: true, force: true })
  }
})

async function errorsLoggedBuildingAuthOn(wrap: boolean) {
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(':memory:')
  const kysely = createSqliteKysely({ db, camelCase: true })
  const errors: string[] = []
  const auth = betterAuth({
    secret: 'x'.repeat(40),
    baseURL: 'http://localhost',
    database: {
      db: wrap ? withoutAuthSchemaCheck(kysely) : kysely,
      type: 'sqlite',
    },
    logger: {
      log: (level, message) => level === 'error' && errors.push(message),
    },
  })
  await auth.$context
  await new Promise((resolve) => setTimeout(resolve, 50))
  await kysely.destroy()
  return errors
}

test('an empty scratch database makes Better Auth log a schema mismatch', async () => {
  const errors = await errorsLoggedBuildingAuthOn(false)
  assert.ok(errors.some((e) => /schema mismatch/i.test(e)))
})

test('the schema-only kysely keeps that check from firing', async () => {
  assert.deepEqual(await errorsLoggedBuildingAuthOn(true), [])
})
