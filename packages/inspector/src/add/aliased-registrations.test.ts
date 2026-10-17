import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

type Diagnostic = { code: ErrorCode; message: string }

const makeLogger = (diagnostics: Diagnostic[]) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }) => {
      diagnostics.push({ code, message })
    },
    critical: (code: ErrorCode, message: string) => {
      diagnostics.push({ code, message })
    },
    hasCriticalErrors: () => false,
  }) satisfies InspectorLogger

/** Inside the package, so `@pikku/core` resolves to the real declarations. */
const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const withProject = async (
  files: Record<string, string[]>,
  assertions: (
    state: Awaited<ReturnType<typeof inspect>>,
    diagnostics: Diagnostic[]
  ) => void,
  { resolveCore = false } = {}
) => {
  const rootDir = await mkdtemp(
    resolveCore
      ? join(packageDir, '.tmp-aliased-')
      : join(tmpdir(), 'pikku-aliased-')
  )
  const paths: string[] = []
  for (const [name, lines] of Object.entries(files)) {
    const path = join(rootDir, name)
    await writeFile(path, lines.join('\n'))
    paths.push(path)
  }
  const diagnostics: Diagnostic[] = []
  try {
    const state = await inspect(makeLogger(diagnostics), paths, { rootDir })
    assertions(state, diagnostics)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const indirect = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((d) => d.code === ErrorCode.REGISTRATION_NOT_A_DIRECT_CALL)

describe('registrations reached under another name', () => {
  test('an aliased addTagMiddleware still registers the tag', async () => {
    await withProject(
      {
        'gate.ts': [
          "import { addTagMiddleware as guard, pikkuMiddleware as mw } from '#pikku'",
          'export const lockGate = () =>',
          "  guard('todos', [mw(async (_s, _w, next) => next())])",
        ],
      },
      (state) => {
        const group = state.middleware.tagMiddleware.get('todos')
        assert.ok(group, 'the aliased call must register the todos tag')
        assert.equal(group.count, 1)
        assert.equal(group.exportName, 'lockGate')
      }
    )
  })

  test('a namespace import still registers the tag', async () => {
    await withProject(
      {
        'gate.ts': [
          "import * as pikku from '#pikku'",
          'export const lockGate = () =>',
          "  pikku.addTagMiddleware('todos', [",
          '    pikku.pikkuMiddleware(async (_s, _w, next) => next()),',
          '  ])',
        ],
      },
      (state) => {
        const group = state.middleware.tagMiddleware.get('todos')
        assert.ok(group, 'the namespaced call must register the todos tag')
        assert.equal(group.count, 1)
      }
    )
  })

  test('aliases of addHTTPMiddleware and addGlobalMiddleware register', async () => {
    await withProject(
      {
        'gates.ts': [
          "import { addHTTPMiddleware as onRoute, addGlobalMiddleware as everywhere, pikkuMiddleware } from '#pikku'",
          'const pass = pikkuMiddleware(async (_s, _w, next) => next())',
          "export const routeGate = () => onRoute('/admin/*', [pass])",
          'everywhere([pass])',
        ],
      },
      (state) => {
        assert.ok(state.http.routeMiddleware.get('/admin/*'))
        assert.equal(state.middleware.globalFiles.size, 1)
      }
    )
  })

  test('a const bound to the helper registers', async () => {
    await withProject(
      {
        'gate.ts': [
          "import { addTagMiddleware, pikkuMiddleware } from '#pikku'",
          'const guard = addTagMiddleware',
          'export const lockGate = () =>',
          "  guard('todos', [pikkuMiddleware(async (_s, _w, next) => next())])",
        ],
      },
      (state) => {
        assert.ok(state.middleware.tagMiddleware.get('todos'))
      }
    )
  })

  test('aliased permission helpers register their definitions', async () => {
    await withProject(
      {
        'permissions.ts': [
          "import { pikkuPermission as can, pikkuAuth as signedIn, pikkuPermissionFactory as canFor } from '#pikku'",
          'export const isOwner = can(async (_s, _data, { session }) => !!session)',
          'export const isSignedIn = signedIn(async (_s, session) => !!session)',
          'export const hasRole = canFor(({ role }: { role: string }) =>',
          '  can(async (_s, _d, { session }) => session?.role === role)',
          ')',
        ],
      },
      (state) => {
        const definitions = state.permissions.definitions
        assert.ok(definitions.isOwner, 'pikkuPermission alias')
        assert.equal(definitions.isSignedIn?.requiresData, false)
        assert.equal(definitions.hasRole?.factory, true)
        assert.equal(
          Object.keys(definitions).length,
          3,
          'the permission inside the factory belongs to the factory'
        )
      }
    )
  })

  test('an aliased pikkuFunc still requires a session', async () => {
    await withProject(
      {
        'func.ts': [
          "import { pikkuFunc as pikkuOpenFunc, pikkuFunc as handler } from '#pikku'",
          'export const readSecret = pikkuOpenFunc<void, string>({',
          "  func: async () => 'secret',",
          '})',
          'export const readOther = handler<void, string>({',
          "  func: async () => 'other',",
          '})',
        ],
      },
      (state) => {
        assert.equal(state.functions.meta.readSecret?.sessionless, false)
        assert.equal(state.functions.meta.readOther?.sessionless, false)
      }
    )
  })

  test('aliased pikkuBetterAuth and betterAuth are still discovered', async () => {
    await withProject(
      {
        'auth.ts': [
          "import { pikkuBetterAuth as withAuth } from '@pikku/better-auth'",
          "import { betterAuth as configure } from 'better-auth'",
          'export const auth = withAuth(() =>',
          "  configure({ socialProviders: { github: { clientId: 'x', clientSecret: 'y' } } })",
          ')',
        ],
      },
      (state) => {
        assert.equal(state.auth.definition?.exportName, 'auth')
        assert.deepEqual(state.auth.providers, ['github'])
      }
    )
  })

  test('the admin() refusal still applies under an aliased betterAuth', async () => {
    await assert.rejects(
      withProject(
        {
          'auth.ts': [
            "import { pikkuBetterAuth } from '@pikku/better-auth'",
            "import * as ba from 'better-auth'",
            "import { admin } from 'better-auth/plugins'",
            'export const auth = pikkuBetterAuth(() =>',
            '  ba.betterAuth({ plugins: [admin()] })',
            ')',
          ],
        },
        () => {}
      ),
      /admin\(\) plugin is not supported/
    )
  })

  test('a lookalike that is not a pikku helper registers nothing', async () => {
    await withProject(
      {
        'local.ts': [
          'const addTag = (_tag: string, _m: unknown[]) => {}',
          "addTag('todos', [])",
        ],
      },
      (state, diagnostics) => {
        assert.equal(state.middleware.tagMiddleware.size, 0)
        assert.deepEqual(indirect(diagnostics), [])
      }
    )
  })
})

describe('registrations resolved through @pikku/core re-exports', () => {
  test('aliased and namespaced core imports register', async () => {
    await withProject(
      {
        'gate.ts': [
          "import { addTagMiddleware as guard, pikkuMiddleware } from '@pikku/core/middleware'",
          "import * as core from '@pikku/core/middleware'",
          'const pass = pikkuMiddleware(async (_s, _w, next) => next())',
          "export const lockGate = () => guard('todos', [pass])",
          "export const adminGate = () => core.addTagMiddleware('admin', [pass])",
        ],
      },
      (state, diagnostics) => {
        assert.ok(state.middleware.tagMiddleware.get('todos'))
        assert.ok(state.middleware.tagMiddleware.get('admin'))
        assert.deepEqual(indirect(diagnostics), [])
      },
      { resolveCore: true }
    )
  })

  test('a local barrel renaming the helper still registers', async () => {
    await withProject(
      {
        'barrel.ts': [
          "export { addTagMiddleware as tagGate } from '@pikku/core/middleware'",
          "export * from '@pikku/core/middleware'",
        ],
        'gate.ts': [
          "import { tagGate, pikkuMiddleware } from './barrel.js'",
          'export const lockGate = () =>',
          "  tagGate('todos', [pikkuMiddleware(async (_s, _w, next) => next())])",
        ],
      },
      (state) => {
        assert.ok(state.middleware.tagMiddleware.get('todos'))
      },
      { resolveCore: true }
    )
  })

  test('a wrapper forwarding to core is not itself a registration', async () => {
    await withProject(
      {
        'pikku-middleware-types.gen.ts': [
          "import { addTagMiddleware as addTagMiddlewareCore, addGlobalMiddleware as addGlobalMiddlewareCore } from '@pikku/core/middleware'",
          'export const addTagMiddleware = (tag: string, middleware: any[]) => {',
          '  addTagMiddlewareCore(tag, middleware, null)',
          '}',
          'export const addGlobalMiddleware = (middleware: any[]) =>',
          '  addGlobalMiddlewareCore(middleware, null)',
        ],
      },
      (state, diagnostics) => {
        assert.equal(state.middleware.tagMiddleware.size, 0)
        assert.equal(state.middleware.globalFiles.size, 0)
        assert.deepEqual(diagnostics, [])
      },
      { resolveCore: true }
    )
  })
})

describe('a gate helper used as a value', () => {
  test('is reported, since its registration cannot be seen', async () => {
    await withProject(
      {
        'gate.ts': [
          "import { addTagMiddleware, pikkuPermission } from '#pikku'",
          'const register = (fn: unknown) => fn',
          'register(addTagMiddleware)',
          'export const helpers = { can: pikkuPermission }',
        ],
      },
      (_state, diagnostics) => {
        const reported = indirect(diagnostics)
        assert.equal(reported.length, 2)
        assert.match(reported[0]!.message, /addTagMiddleware/)
        assert.match(reported[1]!.message, /pikkuPermission/)
      }
    )
  })

  test('is reported through an alias and a namespace', async () => {
    await withProject(
      {
        'gate.ts': [
          "import { addTagMiddleware as guard } from '@pikku/core/middleware'",
          "import * as core from '@pikku/core/middleware'",
          'export const pick = (open: boolean) => (open ? undefined : guard)',
          'export const all = [core.addGlobalMiddleware]',
        ],
      },
      (_state, diagnostics) => {
        const reported = indirect(diagnostics).map((d) => d.message)
        assert.equal(reported.length, 2)
        assert.match(reported[0]!, /'guard' \(addTagMiddleware\)/)
        assert.match(reported[1]!, /'core\.addGlobalMiddleware'/)
      },
      { resolveCore: true }
    )
  })

  test('imports, re-exports and types are not reported', async () => {
    await withProject(
      {
        'gate.ts': [
          "import { addTagMiddleware, pikkuMiddleware } from '@pikku/core/middleware'",
          "export { addTagMiddleware } from '@pikku/core/middleware'",
          'export type Register = typeof addTagMiddleware',
          'export type Make = ReturnType<typeof pikkuMiddleware>',
        ],
      },
      (_state, diagnostics) => {
        assert.deepEqual(indirect(diagnostics), [])
      },
      { resolveCore: true }
    )
  })
})
