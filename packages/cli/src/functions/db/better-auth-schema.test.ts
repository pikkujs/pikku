import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

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

    const moduleUrl = resolve(
      import.meta.dirname,
      'better-auth-schema.ts'
    )
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
