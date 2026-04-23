import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'

describe('addFunctions duplicate name handling', () => {
  test('logs a critical error when function name is duplicated across files', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-duplicate-function-'))
    const fileA = join(rootDir, 'a.ts')
    const fileB = join(rootDir, 'b.ts')

    await writeFile(
      fileA,
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const createUser = pikkuFunc({',
        '  func: async () => ({ ok: true })',
        '})',
      ].join('\n')
    )

    await writeFile(
      fileB,
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const createUser = pikkuFunc({',
        '  func: async () => ({ ok: true })',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    const logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      critical: (code: string, message: string) => {
        criticals.push({ code, message })
      },
    }

    try {
      const state = await inspect(logger, [fileA, fileB], { rootDir })
      const nameCollision = criticals.find(
        (entry) => entry.code === ErrorCode.DUPLICATE_FUNCTION_NAME
      )
      assert.ok(nameCollision)
      assert.match(nameCollision.message, /createUser/)
      assert.strictEqual(state.rpc.internalMeta['createUser'], 'createUser')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
