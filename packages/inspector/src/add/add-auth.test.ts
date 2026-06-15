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
  test('extracts socialProviders keys from the betterAuth call', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = defineAuth(() =>',
        '  betterAuth({',
        '    socialProviders: {',
        "      github: { clientId: 'x', clientSecret: 'y' },",
        "      google: { clientId: 'x', clientSecret: 'y' },",
        '    },',
        '  })',
        ')',
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
        basePath: '/api/auth',
        hasCredentials: false,
        services: { optimized: true, services: [] },
      })
      // The /api/auth/** routes are emitted into a generated auth.gen.ts; the
      // user's source file must NOT be imported into the HTTP bootstrap.
      assert.ok(
        !state.http.files.has(file),
        'defineAuth source file must not be added to http.files'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('captures a custom basePath literal and credentials flag', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-basepath-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = defineAuth(() =>',
        '  betterAuth({',
        "    basePath: '/auth',",
        '    emailAndPassword: { enabled: true },',
        "    socialProviders: { github: { clientId: 'x', clientSecret: 'y' } },",
        '  })',
        ')',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.equal(state.auth.definition?.basePath, '/auth')
      assert.equal(state.auth.definition?.hasCredentials, true)
      assert.deepEqual(state.auth.providers, ['github'])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('credentials-only (no socialProviders) records no providers', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-creds-only-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = defineAuth(() =>',
        '  betterAuth({ emailAndPassword: { enabled: true } })',
        ')',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.deepEqual(state.auth.providers, [])
      assert.equal(state.auth.definition?.hasCredentials, true)
      assert.ok(state.auth.files.has(file), 'source file still tracked')
      assert.ok(
        !state.http.files.has(file),
        'defineAuth source file must not be added to http.files'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('errors when defineAuth is not given a factory function', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-nonfactory-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/better-auth'",
        'export const auth = defineAuth({ providers: [] } as any)',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [file], { rootDir })
      const hit = criticals.find((e) => e.code === ErrorCode.MISSING_NAME)
      assert.ok(hit, 'expected MISSING_NAME critical for non-factory argument')
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
        "import { defineAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'const auth = defineAuth(() => betterAuth({}))',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [file], { rootDir })
      const hit = criticals.find((e) => e.code === ErrorCode.AUTH_NOT_EXPORTED)
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
        "import { defineAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = defineAuth(() => betterAuth({}))',
      ].join('\n')
    )
    await writeFile(
      fileB,
      [
        "import { defineAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth2 = defineAuth(() => betterAuth({}))',
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

  test('extracts services from a destructured factory param', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-svc-destr-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = defineAuth(({ kysely, secrets }) =>',
        '  betterAuth({ database: { db: kysely, type: "postgres" }, secret: secrets })',
        ')',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.deepEqual(state.auth.definition?.services, {
        optimized: true,
        services: ['kysely', 'secrets'],
      })
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('extracts services from the destructured factory param', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-svc-member-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { defineAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = defineAuth(async ({ kysely, secrets }) =>',
        '  betterAuth({',
        '    database: { db: kysely, type: "postgres" },',
        "    socialProviders: { github: await secrets.getSecret('GITHUB_OAUTH') },",
        '  })',
        ')',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.deepEqual(state.auth.definition?.services, {
        optimized: true,
        services: ['kysely', 'secrets'],
      })
      assert.deepEqual(state.auth.providers, ['github'])
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
        "import { defineAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = defineAuth(({ kysely }) =>',
        '  betterAuth({ database: { db: kysely, type: "postgres" } })',
        ')',
      ].join('\n')
    )
    // Mimic the CLI-generated wiring file: the handler is a plain arrow (so the
    // inspector resolves a valid func and the routes are not skipped) that
    // delegates to createAuthHandler(...).func.
    await writeFile(
      genFile,
      [
        "import { pikkuSessionlessFunc } from '#pikku'",
        "import { wireHTTPRoutes } from '@pikku/core/http'",
        "import { createAuthHandler } from '@pikku/better-auth'",
        "import { auth } from './auth.js'",
        'const authConfigHandler = createAuthHandler(auth)',
        'export const authHandler = pikkuSessionlessFunc({',
        '  func: (services, data, interaction) =>',
        '    authConfigHandler.func(services, data, interaction),',
        '})',
        'wireHTTPRoutes({',
        '  routes: {',
        "    getAuthCatchAll: { method: 'get', route: '/api/auth{/*splat}', func: authHandler, auth: false },",
        '  },',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    const errors: string[] = []
    const logger = makeLogger(criticals)
    logger.error = (message: string) => {
      errors.push(message)
    }
    try {
      const state = await inspect(logger, [authFile, genFile], { rootDir })
      assert.equal(criticals.length, 0, 'no critical diagnostics')
      assert.equal(
        errors.filter((e) => e.includes('No valid')).length,
        0,
        `handler func must resolve; got: ${errors.join('; ')}`
      )
      const handlerMeta = state.functions.meta['authHandler']
      assert.ok(handlerMeta, 'generated authHandler must register a function')
      // The stamp (keyed on AUTH_HANDLER_FUNC_ID, ordered before aggregation)
      // overwrites the pass-through arrow's empty service list with the real deps.
      assert.deepEqual(handlerMeta.services, {
        optimized: true,
        services: ['kysely'],
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
        "import { defineAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        "export const auth = defineAuth(() => betterAuth({ socialProviders: { discord: { clientId: 'x', clientSecret: 'y' } } }))",
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
