import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

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

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    const logger: InspectorLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      critical: (code: ErrorCode, message: string) => {
        criticals.push({ code, message })
      },
      hasCriticalErrors: () => criticals.length > 0,
    }

    try {
      const state = await inspect(logger, [fileA, fileB], { rootDir })
      const nameCollision = criticals.find(
        (entry) => entry.code === ErrorCode.DUPLICATE_FUNCTION_NAME
      )
      assert.ok(nameCollision)
      assert.match(nameCollision!.message, /createUser/)
      assert.strictEqual(state.rpc.internalMeta['createUser'], 'createUser')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('allows same base function name across files when versions differ', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-versioned-function-'))
    const fileA = join(rootDir, 'a.ts')
    const fileB = join(rootDir, 'b.ts')

    await writeFile(
      fileA,
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const createUser = pikkuFunc({',
        '  version: 1,',
        '  func: async () => ({ ok: true })',
        '})',
      ].join('\n')
    )

    await writeFile(
      fileB,
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const createUser = pikkuFunc({',
        '  version: 2,',
        '  func: async () => ({ ok: true })',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    const logger: InspectorLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      critical: (code: ErrorCode, message: string) => {
        criticals.push({ code, message })
      },
      hasCriticalErrors: () => criticals.length > 0,
    }

    try {
      const state = await inspect(logger, [fileA, fileB], { rootDir })
      const nameCollision = criticals.find(
        (entry) => entry.code === ErrorCode.DUPLICATE_FUNCTION_NAME
      )
      assert.equal(nameCollision, undefined)
      assert.strictEqual(state.rpc.internalMeta['createUser'], 'createUser@v2')
      assert.ok(state.functions.meta['createUser@v1'])
      assert.ok(state.functions.meta['createUser@v2'])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('logs a critical error when exposed function name is duplicated across files', async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), 'pikku-exposed-duplicate-function-')
    )
    const fileA = join(rootDir, 'a.ts')
    const fileB = join(rootDir, 'b.ts')

    await writeFile(
      fileA,
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const createUser = pikkuFunc({',
        '  expose: true,',
        '  func: async () => ({ ok: true })',
        '})',
      ].join('\n')
    )

    await writeFile(
      fileB,
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const createUser = pikkuFunc({',
        '  expose: true,',
        '  func: async () => ({ ok: true })',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    const logger: InspectorLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      critical: (code: ErrorCode, message: string) => {
        criticals.push({ code, message })
      },
      hasCriticalErrors: () => criticals.length > 0,
    }

    try {
      await inspect(logger, [fileA, fileB], { rootDir })
      const nameCollision = criticals.find(
        (entry) => entry.code === ErrorCode.DUPLICATE_FUNCTION_NAME
      )
      assert.ok(nameCollision)
      assert.match(
        nameCollision!.message,
        /Function name 'createUser' is not unique/
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
