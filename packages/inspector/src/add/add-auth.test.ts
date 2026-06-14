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
    critical: (code: ErrorCode, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }) satisfies InspectorLogger

describe('addAuth inspector', () => {
  test('extracts provider string literals from wireAuth call', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { wireAuth } from '@pikku/auth-js'",
        "wireAuth({ providers: ['github', 'google'] })",
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.deepEqual(state.auth.providers, ['github', 'google'])
      // OAuth-provider wireAuth is handled by a generated auth.gen.ts; the user's
      // source file must NOT be imported into the HTTP bootstrap (would
      // double-register the /auth/* routes).
      assert.ok(
        !state.http.files.has(file),
        'provider wireAuth file must not be added to http.files'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('deduplicates providers across multiple wireAuth calls', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-dedup-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { wireAuth } from '@pikku/auth-js'",
        "wireAuth({ providers: ['github'] })",
        "wireAuth({ providers: ['github', 'google'] })",
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.deepEqual(state.auth.providers, ['github', 'google'])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('logs critical error when a provider is a non-literal reference', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-nonlit-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { wireAuth } from '@pikku/auth-js'",
        "const PROVIDER = 'github'",
        'wireAuth({ providers: [PROVIDER] })',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [file], { rootDir })
      const hit = criticals.find(
        (e) => e.code === ErrorCode.NON_LITERAL_WIRE_NAME
      )
      assert.ok(hit, 'expected NON_LITERAL_WIRE_NAME critical')
      assert.match(hit!.message, /PROVIDER/)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('does not error when providers is absent (credentials-only wireAuth)', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-creds-only-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { wireAuth } from '@pikku/auth-js'",
        'wireAuth({ credentials: { authorize: async () => null } })',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(
        criticals.length,
        0,
        'credentials-only wireAuth must not produce errors'
      )
      assert.deepEqual(
        state.auth.providers,
        [],
        'no providers should be extracted'
      )
      assert.ok(state.auth.files.has(file), 'source file still tracked')
      // Credentials-only wireAuth registers its routes at runtime, so the file
      // must be imported into the HTTP bootstrap (added to http.files) for the
      // /auth/* routes to exist in the deployed worker.
      assert.ok(
        state.http.files.has(file),
        'credentials-only wireAuth file must be added to http.files'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('logs critical error when providers is not an array literal', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-nonarray-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { wireAuth } from '@pikku/auth-js'",
        "const PROVIDERS = ['github']",
        'wireAuth({ providers: PROVIDERS })',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [file], { rootDir })
      const hit = criticals.find((e) => e.code === ErrorCode.MISSING_NAME)
      assert.ok(
        hit,
        'expected MISSING_NAME critical for non-array-literal providers'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('tracks source file in state.auth.files', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-files-'))
    const file = join(rootDir, 'auth.wiring.ts')

    await writeFile(
      file,
      [
        "import { wireAuth } from '@pikku/auth-js'",
        "wireAuth({ providers: ['discord'] })",
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.ok(
        state.auth.files.has(file),
        'source file should be tracked in state.auth.files'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
