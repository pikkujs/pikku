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
      diagnostic: ({ code, message }) => {
        criticals.push({ code, message })
      },
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
      diagnostic: ({ code, message }) => {
        criticals.push({ code, message })
      },
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

  test('strips VN suffix so createUserV1 + version:1 groups with createUser as createUser@v1', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-vn-suffix-'))
    const fileV1 = join(rootDir, 'create-user-v1.ts')
    const fileLatest = join(rootDir, 'create-user.ts')

    await writeFile(
      fileV1,
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const createUserV1 = pikkuFunc({',
        '  version: 1,',
        '  func: async () => ({ ok: true })',
        '})',
      ].join('\n')
    )

    await writeFile(
      fileLatest,
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const createUser = pikkuFunc({',
        '  func: async () => ({ ok: true })',
        '})',
      ].join('\n')
    )

    const logger: InspectorLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      diagnostic: () => {},
      critical: () => {},
      hasCriticalErrors: () => false,
    }

    try {
      const state = await inspect(logger, [fileV1, fileLatest], { rootDir })
      // V1 suffix stripped: createUserV1 + version:1 → createUser@v1
      assert.ok(
        state.functions.meta['createUser@v1'],
        'createUser@v1 should exist'
      )
      assert.strictEqual(state.functions.meta['createUser@v1']!.version, 1)
      // Unversioned createUser auto-promoted to createUser@v2
      assert.ok(
        state.functions.meta['createUser@v2'],
        'createUser@v2 should exist'
      )
      assert.strictEqual(state.functions.meta['createUser@v2']!.version, 2)
      // No stale createUserV1@v1 entry
      assert.strictEqual(state.functions.meta['createUserV1@v1'], undefined)
      // Latest alias points to v2
      assert.strictEqual(state.rpc.internalMeta['createUser'], 'createUser@v2')
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
      diagnostic: ({ code, message }) => {
        criticals.push({ code, message })
      },
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

describe('addFunctions implementationHash', () => {
  test('records a stable implementation hash for an inline function', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-function-hash-inline-'))
    const file = join(rootDir, 'inline.ts')

    await writeFile(
      file,
      [
        "import { pikkuFunc } from '@pikku/core'",
        'export const createUser = pikkuFunc({',
        '  expose: true,',
        '  func: async ({ logger }, input: { name: string }) => {',
        "    logger.info('create user')",
        '    return { ok: true, name: input.name }',
        '  }',
        '})',
      ].join('\n')
    )

    const logger: InspectorLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      diagnostic: () => {},
      critical: () => {},
      hasCriticalErrors: () => false,
    }

    try {
      const first = await inspect(logger, [file], { rootDir })
      const second = await inspect(logger, [file], { rootDir })
      const firstHash = first.functions.meta['createUser']?.implementationHash
      const secondHash = second.functions.meta['createUser']?.implementationHash

      assert.match(firstHash ?? '', /^[0-9a-f]{16}$/)
      assert.strictEqual(firstHash, secondHash)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('changes when a referenced handler implementation changes', async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), 'pikku-function-hash-referenced-')
    )
    const file = join(rootDir, 'referenced.ts')

    const writeSource = async (bodyLine: string) => {
      await writeFile(
        file,
        [
          "import { pikkuFunc } from '@pikku/core'",
          '',
          'const handler = async () => {',
          `  ${bodyLine}`,
          '  return { ok: true }',
          '}',
          '',
          'export const createUser = pikkuFunc({',
          '  func: handler,',
          '})',
        ].join('\n')
      )
    }

    const logger: InspectorLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      diagnostic: () => {},
      critical: () => {},
      hasCriticalErrors: () => false,
    }

    try {
      await writeSource("console.log('first')")
      const first = await inspect(logger, [file], { rootDir })

      await writeSource("console.log('second')")
      const second = await inspect(logger, [file], { rootDir })

      assert.notStrictEqual(
        first.functions.meta['createUser']?.implementationHash,
        second.functions.meta['createUser']?.implementationHash
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})

describe('pikkuChannelConnectionFunc generic mapping', () => {
  // Regression: pikkuChannelConnectionFunc<Out> has a single generic that is the
  // OUTPUT type (input is always void). The inspector must NOT record that generic
  // as inputSchemaName — otherwise the empty WS handshake is validated against an
  // input schema requiring the send-payload shape and the connect is rejected 403.
  test('does not map the output generic to inputSchemaName', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-channel-connect-'))
    const file = join(rootDir, 'channel.ts')

    await writeFile(
      file,
      [
        'type Sessionless<In, Out> = (',
        '  services: any,',
        '  data: In,',
        '  interaction: any',
        ') => Promise<Out>',
        'export const pikkuChannelConnectionFunc = <Out = unknown>(',
        '  func: Sessionless<void, Out>',
        ') => ({ func })',
        'export const onCardsConnect = pikkuChannelConnectionFunc<{',
        "  type: 'hello'",
        '  count: number',
        '}>(async (_services, _data, _interaction) => {})',
      ].join('\n')
    )

    const logger: InspectorLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      diagnostic: () => {},
      critical: () => {},
      hasCriticalErrors: () => false,
    }

    try {
      const state = await inspect(logger, [file], { rootDir })
      const meta = state.functions.meta['onCardsConnect']
      assert.ok(meta, 'onCardsConnect meta should exist')
      assert.strictEqual(
        meta!.inputSchemaName,
        null,
        'connect input must be void (no input schema), not the output generic'
      )
      assert.deepStrictEqual(meta!.inputs, [])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
