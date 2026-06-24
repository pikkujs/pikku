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

describe('addPermission — pikkuAuth', () => {
  test('does not record a wires meta for the session parameter', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-auth-wires-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        'const pikkuAuth = (x: any) => x',
        'export const isAuthenticated = pikkuAuth(async ({ logger }, session) => {',
        '  logger.info({ type: "auth-check" })',
        '  return !!session',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      const def = state.permissions.definitions['isAuthenticated']
      assert.ok(def, 'isAuthenticated permission should be recorded')
      // The pikkuAuth handler is (services, session) — session is NOT a wires
      // bag and must not be flagged as a non-destructured wires parameter.
      assert.equal(def.wires, undefined)
      const wireDiag = (state.diagnostics ?? []).find(
        (d) =>
          d.code === ErrorCode.WIRES_NOT_DESTRUCTURED &&
          d.message.includes('isAuthenticated')
      )
      assert.equal(wireDiag, undefined)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
