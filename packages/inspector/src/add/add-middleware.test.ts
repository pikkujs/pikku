import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { ErrorCode } from '../error-codes.js'
import type { InspectorLogger, MiddlewareGroupMeta } from '../types.js'

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

/** Every file that registered middleware for one pattern or tag. */
const sourceFiles = (group: MiddlewareGroupMeta | undefined): string[] =>
  group
    ? [
        group.sourceFile,
        ...(group.additionalRegistrations ?? []).map((r) => r.sourceFile),
      ]
    : []

/** Runs the inspector over files written into a throwaway directory. */
const withProject = async (
  prefix: string,
  files: Record<string, string[]>,
  assertions: (state: Awaited<ReturnType<typeof inspect>>) => void
) => {
  const rootDir = await mkdtemp(join(tmpdir(), prefix))
  const paths: string[] = []
  for (const [name, lines] of Object.entries(files)) {
    const path = join(rootDir, name)
    await writeFile(path, lines.join('\n'))
    paths.push(path)
  }
  try {
    assertions(await inspect(makeLogger([]), paths, { rootDir }))
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('addMiddleware inspector', () => {
  describe('two files registering the same HTTP pattern', () => {
    // The group is keyed by pattern, so the second call used to overwrite the
    // first. Codegen emits imports from what is stored, so the losing file was
    // never imported and its middleware never registered — an app could lose
    // its session bridge to an unrelated '*' group and see nothing go wrong
    // until a request arrived without a session.
    const project = {
      'session.ts': [
        "import { addHTTPMiddleware, pikkuMiddleware } from '#pikku'",
        'export const sessionMiddleware = () =>',
        "  addHTTPMiddleware('*', [",
        '    pikkuMiddleware(async (_s, _w, next) => next()),',
        '  ])',
      ],
      'logging.ts': [
        "import { addHTTPMiddleware, pikkuMiddleware } from '#pikku'",
        'export const loggingMiddleware = () =>',
        "  addHTTPMiddleware('*', [",
        '    pikkuMiddleware(async (_s, _w, next) => next()),',
        '  ])',
      ],
    }

    test('keeps both registrations', async () => {
      await withProject('pikku-mw-http-collide-', project, (state) => {
        const group = state.http.routeMiddleware.get('*')
        assert.ok(group, "expected a group for '*'")
        assert.equal(
          sourceFiles(group).length,
          2,
          'both files must survive, or one middleware silently stops running'
        )
      })
    })

    test('keeps both export names, so both can be imported', async () => {
      await withProject('pikku-mw-http-names-', project, (state) => {
        const group = state.http.routeMiddleware.get('*')!
        const names = [
          group.exportName,
          ...(group.additionalRegistrations ?? []).map((r) => r.exportName),
        ]
        assert.deepEqual(names.sort(), [
          'loggingMiddleware',
          'sessionMiddleware',
        ])
      })
    })

    test('unions the services both registrations need', async () => {
      await withProject('pikku-mw-http-services-', project, (state) => {
        const group = state.http.routeMiddleware.get('*')!
        assert.equal(
          new Set(group.services.services).size,
          group.services.services.length,
          'services must not repeat when two groups merge'
        )
      })
    })
  })

  test('a single registration is unchanged', async () => {
    await withProject(
      'pikku-mw-http-single-',
      {
        'session.ts': [
          "import { addHTTPMiddleware, pikkuMiddleware } from '#pikku'",
          'export const sessionMiddleware = () =>',
          "  addHTTPMiddleware('*', [",
          '    pikkuMiddleware(async (_s, _w, next) => next()),',
          '  ])',
        ],
      },
      (state) => {
        const group = state.http.routeMiddleware.get('*')!
        assert.equal(group.exportName, 'sessionMiddleware')
        assert.equal(
          group.additionalRegistrations,
          undefined,
          'nothing to merge means nothing extra to serialize'
        )
      }
    )
  })

  test('different patterns stay separate groups', async () => {
    await withProject(
      'pikku-mw-http-distinct-',
      {
        'session.ts': [
          "import { addHTTPMiddleware, pikkuMiddleware } from '#pikku'",
          'export const sessionMiddleware = () =>',
          "  addHTTPMiddleware('*', [",
          '    pikkuMiddleware(async (_s, _w, next) => next()),',
          '  ])',
        ],
        'api.ts': [
          "import { addHTTPMiddleware, pikkuMiddleware } from '#pikku'",
          'export const apiMiddleware = () =>',
          "  addHTTPMiddleware('/api/*', [",
          '    pikkuMiddleware(async (_s, _w, next) => next()),',
          '  ])',
        ],
      },
      (state) => {
        assert.equal(sourceFiles(state.http.routeMiddleware.get('*')).length, 1)
        assert.equal(
          sourceFiles(state.http.routeMiddleware.get('/api/*')).length,
          1
        )
      }
    )
  })

  test('two files registering the same tag keep both registrations', async () => {
    await withProject(
      'pikku-mw-tag-collide-',
      {
        'session.ts': [
          "import { addTagMiddleware, pikkuMiddleware } from '#pikku'",
          'export const sessionTag = () =>',
          "  addTagMiddleware('api', [",
          '    pikkuMiddleware(async (_s, _w, next) => next()),',
          '  ])',
        ],
        'logging.ts': [
          "import { addTagMiddleware, pikkuMiddleware } from '#pikku'",
          'export const loggingTag = () =>',
          "  addTagMiddleware('api', [",
          '    pikkuMiddleware(async (_s, _w, next) => next()),',
          '  ])',
        ],
      },
      (state) => {
        assert.equal(
          sourceFiles(state.middleware.tagMiddleware.get('api')).length,
          2
        )
      }
    )
  })
})
