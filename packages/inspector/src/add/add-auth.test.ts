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
  test('extracts provider string literals from defineAuth export', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        "export const auth = defineAuth({ providers: ['github', 'google'] })",
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.deepEqual(state.auth.providers, ['github', 'google'])
      assert.deepEqual(state.auth.definition, {
        exportName: 'auth',
        sourceFile: file,
        basePath: '/auth',
        // No authorize/callbacks here — only the always-on configFactory deps.
        services: { optimized: true, services: ['secrets', 'variables'] },
      })
      // The /auth/* routes are emitted into a generated auth.gen.ts; the user's
      // source file must NOT be imported into the HTTP bootstrap.
      assert.ok(
        !state.http.files.has(file),
        'defineAuth source file must not be added to http.files'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('captures a custom basePath literal', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-basepath-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        "export const auth = defineAuth({ providers: ['github'], basePath: '/api/auth' })",
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.equal(state.auth.definition?.basePath, '/api/auth')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('errors when a provider is a non-literal reference', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-nonlit-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        "const PROVIDER = 'github'",
        'export const auth = defineAuth({ providers: [PROVIDER] })',
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

  test('does not error when providers is absent (credentials-only)', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-creds-only-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        'export const auth = defineAuth({ credentials: { authorize: () => async () => null } })',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(
        criticals.length,
        0,
        'credentials-only defineAuth must not produce errors'
      )
      assert.deepEqual(
        state.auth.providers,
        [],
        'no providers should be extracted'
      )
      assert.ok(state.auth.definition, 'definition recorded')
      assert.ok(state.auth.files.has(file), 'source file still tracked')
      // The generated auth.gen.ts wires the routes; the source file is never
      // imported into the HTTP bootstrap.
      assert.ok(
        !state.http.files.has(file),
        'defineAuth source file must not be added to http.files'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('errors when providers is not an array literal', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-nonarray-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        "const PROVIDERS = ['github']",
        'export const auth = defineAuth({ providers: PROVIDERS })',
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

  test('errors when defineAuth is not assigned to an exported const', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-notexport-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        "const auth = defineAuth({ providers: ['github'] })",
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [file], { rootDir })
      const hit = criticals.find(
        (e) => e.code === ErrorCode.AUTH_NOT_EXPORTED
      )
      assert.ok(hit, 'expected AUTH_NOT_EXPORTED critical')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('errors when more than one defineAuth exists in the codebase', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-dupe-'))
    const fileA = join(rootDir, 'auth.ts')
    const fileB = join(rootDir, 'auth-other.ts')

    await writeFile(
      fileA,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        "export const auth = defineAuth({ providers: ['github'] })",
      ].join('\n')
    )
    await writeFile(
      fileB,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        "export const auth2 = defineAuth({ providers: ['google'] })",
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [fileA, fileB], { rootDir })
      const hit = criticals.find(
        (e) => e.code === ErrorCode.DUPLICATE_AUTH_DEFINITION
      )
      assert.ok(hit, 'expected DUPLICATE_AUTH_DEFINITION critical')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('extracts services from authorize + callbacks factories', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-svc-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        'export const auth = defineAuth({',
        '  credentials: {',
        '    authorize: ({ kysely }) => async () => null,',
        '  },',
        '  callbacks: ({ variables }) => ({}),',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      // Union of authorize (kysely) + callbacks (variables) + always-on
      // configFactory deps (secrets, variables).
      assert.deepEqual(state.auth.definition?.services, {
        optimized: true,
        services: ['kysely', 'variables', 'secrets'],
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('stamps the inspected services onto the generated handler meta', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-stamp-'))
    const authFile = join(rootDir, 'auth.ts')
    const genFile = join(rootDir, 'auth.gen.ts')

    await writeFile(
      authFile,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        'export const auth = defineAuth({',
        '  credentials: {',
        '    authorize: ({ kysely }) => async () => null,',
        '  },',
        '})',
      ].join('\n')
    )
    // Mimic the CLI-generated handler: an exported const whose func is an
    // opaque property access. Without the stamp this records zero services, so
    // the deployed worker would never instantiate kysely/secrets/variables.
    await writeFile(
      genFile,
      [
        "import { pikkuSessionlessFunc } from '#pikku'",
        "import { createAuthHandler } from '@pikku/auth-js'",
        "import { auth } from './auth.js'",
        'export const authHandler = pikkuSessionlessFunc({ func: createAuthHandler(auth.configFactory).func })',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [authFile, genFile], {
        rootDir,
      })
      const handlerMeta = state.functions.meta['authHandler']
      assert.ok(handlerMeta, 'generated authHandler must register a function')
      // The stamp (keyed on AUTH_HANDLER_FUNC_ID, ordered before aggregation)
      // overwrites the opaque-handler's empty service list with the real deps.
      assert.deepEqual(handlerMeta.services, {
        optimized: true,
        services: ['kysely', 'secrets', 'variables'],
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('tracks source file in state.auth.files', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-files-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/auth-js'",
        "export const auth = defineAuth({ providers: ['discord'] })",
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
