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

describe('addAuth inspector', () => {
  test('extracts socialProviders keys from the betterAuth call', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(() =>',
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
        cookieCache: false,
        plugins: [],
        services: { optimized: true, services: [] },
      })
      // The /api/auth/** routes are emitted into a generated auth.gen.ts; the
      // user's source file must NOT be imported into the HTTP bootstrap.
      assert.ok(
        !state.http.files.has(file),
        'pikkuBetterAuth source file must not be added to http.files'
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
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(() =>',
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

  test('detects session.cookieCache for the stateless middleware split', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-cookiecache-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(() =>',
        '  betterAuth({',
        '    session: { cookieCache: { enabled: true } },',
        "    emailAndPassword: { enabled: true },",
        '  })',
        ')',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.equal(state.auth.definition?.cookieCache, true)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('cookieCache: { enabled: false } does not enable the stateless split', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-nocache-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(() =>',
        '  betterAuth({',
        '    session: { cookieCache: { enabled: false } },',
        '  })',
        ')',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.equal(state.auth.definition?.cookieCache, false)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('cookieCache: { "enabled": false } (string-literal key) is honoured', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-strkey-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(() =>',
        '  betterAuth({',
        '    session: { cookieCache: { "enabled": false } },',
        '  })',
        ')',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.equal(state.auth.definition?.cookieCache, false)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('extracts plugin ids from the betterAuth plugins array', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-plugins-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        "import { bearer, admin, twoFactor } from 'better-auth/plugins'",
        'export const auth = pikkuBetterAuth(() =>',
        '  betterAuth({',
        "    socialProviders: { github: { clientId: 'x', clientSecret: 'y' } },",
        '    plugins: [bearer(), admin(), twoFactor({ issuer: "pikku" })],',
        '  })',
        ')',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.deepEqual(state.auth.plugins, ['bearer', 'admin', 'twoFactor'])
      assert.deepEqual(state.auth.definition?.plugins, [
        'bearer',
        'admin',
        'twoFactor',
      ])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('records no plugins when the plugins array is absent', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-noplugins-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(() => betterAuth({ emailAndPassword: { enabled: true } }))',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(criticals.length, 0)
      assert.deepEqual(state.auth.plugins, [])
      assert.deepEqual(state.auth.definition?.plugins, [])
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
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(() =>',
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
        'pikkuBetterAuth source file must not be added to http.files'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('errors when pikkuBetterAuth is not given a factory function', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-nonfactory-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        'export const auth = pikkuBetterAuth({ providers: [] } as any)',
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

  test('errors when pikkuBetterAuth is not assigned to an exported const', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-notexport-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'const auth = pikkuBetterAuth(() => betterAuth({}))',
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

  test('errors when pikkuBetterAuth is exported but not a const', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-notconst-'))
    const file = join(rootDir, 'auth.ts')

    await writeFile(
      file,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export let auth = pikkuBetterAuth(() => betterAuth({}))',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [file], { rootDir })
      const hit = criticals.find((e) => e.code === ErrorCode.AUTH_NOT_EXPORTED)
      assert.ok(hit, 'expected AUTH_NOT_EXPORTED critical for non-const export')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('errors when more than one pikkuBetterAuth exists in the codebase', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-dupe-'))
    const fileA = join(rootDir, 'auth.ts')
    const fileB = join(rootDir, 'auth-other.ts')

    await writeFile(
      fileA,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(() => betterAuth({}))',
      ].join('\n')
    )
    await writeFile(
      fileB,
      [
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth2 = pikkuBetterAuth(() => betterAuth({}))',
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
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(({ kysely, secrets }) =>',
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
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(async ({ kysely, secrets }) =>',
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
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        'export const auth = pikkuBetterAuth(({ kysely }) =>',
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
        "import { pikkuBetterAuth } from '@pikku/better-auth'",
        "import { betterAuth } from 'better-auth'",
        "export const auth = pikkuBetterAuth(() => betterAuth({ socialProviders: { discord: { clientId: 'x', clientSecret: 'y' } } }))",
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

  test('user-registered betterAuthStatelessSession sets userStatelessSession', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-stateless-'))
    const file = join(rootDir, 'middleware.ts')
    await writeFile(
      file,
      [
        "import { addHTTPMiddleware } from '#pikku'",
        "import { betterAuthStatelessSession } from '@pikku/better-auth'",
        "addHTTPMiddleware('*', [",
        '  betterAuthStatelessSession({',
        '    mapSession: (r: any) => ({ userId: r.user.id, role: r.user.role }),',
        '  }),',
        '])',
      ].join('\n')
    )
    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(state.auth.userStatelessSession, true)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('a standalone betterAuthStatelessSession() call (not a registration) does NOT set the flag', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-standalone-'))
    const file = join(rootDir, 'start.ts')
    await writeFile(
      file,
      [
        "import { betterAuthStatelessSession } from '@pikku/better-auth'",
        '// harness use, not a global registration',
        'const mw = betterAuthStatelessSession()',
        'void mw',
      ].join('\n')
    )
    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.ok(
        !state.auth.userStatelessSession,
        'a bare call must not count as a registration'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('a route-scoped addHTTPMiddleware registration does NOT set the flag', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-scoped-'))
    const file = join(rootDir, 'middleware.ts')
    await writeFile(
      file,
      [
        "import { addHTTPMiddleware } from '#pikku'",
        "import { betterAuthStatelessSession } from '@pikku/better-auth'",
        "addHTTPMiddleware('/api/admin/*', [betterAuthStatelessSession()])",
      ].join('\n')
    )
    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.ok(
        !state.auth.userStatelessSession,
        'a route-scoped registration must not suppress the global generated middleware'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('betterAuthStatelessSession in a .gen.ts file does NOT set the flag', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-genonly-'))
    const file = join(rootDir, 'auth-middleware.gen.ts')
    await writeFile(
      file,
      [
        "import { addHTTPMiddleware } from '#pikku'",
        "import { betterAuthStatelessSession } from '@pikku/better-auth'",
        "addHTTPMiddleware('*', [betterAuthStatelessSession()])",
      ].join('\n')
    )
    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.ok(
        !state.auth.userStatelessSession,
        'generated file must not self-trigger the skip'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('user-registered global betterAuthSession sets hasUserSessionMiddleware', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-session-'))
    const file = join(rootDir, 'middleware.ts')
    await writeFile(
      file,
      [
        "import { addHTTPMiddleware } from '#pikku'",
        "import { betterAuthSession } from '@pikku/better-auth'",
        "addHTTPMiddleware('*', [",
        '  betterAuthSession({',
        '    impersonation: { loadUser: (id: string) => ({ id }) },',
        '  }),',
        '])',
      ].join('\n')
    )
    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.equal(state.auth.hasUserSessionMiddleware, true)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('betterAuthSession in a .gen.ts file does NOT set hasUserSessionMiddleware', async () => {
    // Critical: the CLI's own auth.gen.ts contains addHTTPMiddleware('*',
    // [betterAuthSession()]). It must not count as a user registration, or it
    // would suppress itself and leave the chain with no session middleware.
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-auth-session-gen-'))
    const file = join(rootDir, 'auth.gen.ts')
    await writeFile(
      file,
      [
        "import { addHTTPMiddleware } from '#pikku'",
        "import { betterAuthSession } from '@pikku/better-auth'",
        "addHTTPMiddleware('*', [betterAuthSession()])",
      ].join('\n')
    )
    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      assert.ok(
        !state.auth.hasUserSessionMiddleware,
        'generated file must not self-trigger the skip'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
