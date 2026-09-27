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

  describe('instance ids are unique across the whole inspection', () => {
    // The per-group index restarted at 0 for every source file, so the second
    // file to register against a group minted an id the first already owned and
    // overwrote its entry. `instances` is what downstream codegen reads for a
    // registration's source file and definition, so the overwritten middleware
    // vanished from it while `count` still claimed two.
    test('two files on one HTTP pattern get two distinct instances', async () => {
      await withProject(
        'pikku-mw-http-instances-',
        {
          'cors.middleware.ts': [
            "import { addHTTPMiddleware, pikkuMiddleware } from '#pikku'",
            'const corsMiddleware = pikkuMiddleware(async (_s, _w, next) => {',
            '  await next()',
            '})',
            "addHTTPMiddleware('*', [corsMiddleware])",
          ],
          'other.middleware.ts': [
            "import { addHTTPMiddleware, pikkuMiddleware } from '#pikku'",
            'const httpMarker = pikkuMiddleware(async (_s, _w, next) => {',
            '  await next()',
            '})',
            "addHTTPMiddleware('*', [httpMarker])",
          ],
        },
        (state) => {
          const group = state.http.routeMiddleware.get('*')!
          assert.equal(
            new Set(group.instanceIds).size,
            2,
            'each registration needs its own instance id'
          )
          assert.equal(group.instanceIds.length, group.count)
          const definitionIds = group.instanceIds.map(
            (id) => state.middleware.instances[id]?.definitionId
          )
          assert.deepEqual(
            definitionIds.slice().sort(),
            ['corsMiddleware', 'httpMarker'],
            'neither registration may be overwritten in the instance map'
          )
        }
      )
    })

    test('two files registering the same tag get two distinct instances', async () => {
      await withProject(
        'pikku-mw-tag-instances-',
        {
          'session.ts': [
            "import { addTagMiddleware, pikkuMiddleware } from '#pikku'",
            'const sessionMw = pikkuMiddleware(async (_s, _w, next) => {',
            '  await next()',
            '})',
            "addTagMiddleware('api', [sessionMw])",
          ],
          'logging.ts': [
            "import { addTagMiddleware, pikkuMiddleware } from '#pikku'",
            'const loggingMw = pikkuMiddleware(async (_s, _w, next) => {',
            '  await next()',
            '})',
            "addTagMiddleware('api', [loggingMw])",
          ],
        },
        (state) => {
          const group = state.middleware.tagMiddleware.get('api')!
          assert.equal(new Set(group.instanceIds).size, 2)
          const definitionIds = group.instanceIds.map(
            (id) => state.middleware.instances[id]?.definitionId
          )
          assert.deepEqual(definitionIds.slice().sort(), [
            'loggingMw',
            'sessionMw',
          ])
        }
      )
    })

    test('two files registering the same channel tag get two distinct instances', async () => {
      await withProject(
        'pikku-mw-channel-instances-',
        {
          'session.ts': [
            "import { addChannelMiddleware, pikkuChannelMiddleware } from '#pikku'",
            'const sessionMw = pikkuChannelMiddleware(async (_s, _w, next) => {',
            '  await next()',
            '})',
            "addChannelMiddleware('api', [sessionMw])",
          ],
          'logging.ts': [
            "import { addChannelMiddleware, pikkuChannelMiddleware } from '#pikku'",
            'const loggingMw = pikkuChannelMiddleware(async (_s, _w, next) => {',
            '  await next()',
            '})',
            "addChannelMiddleware('api', [loggingMw])",
          ],
        },
        (state) => {
          const group = state.channelMiddleware.tagMiddleware.get('api')!
          assert.equal(new Set(group.instanceIds).size, 2)
          const definitionIds = group.instanceIds.map(
            (id) => state.channelMiddleware.instances[id]?.definitionId
          )
          assert.deepEqual(definitionIds.slice().sort(), [
            'loggingMw',
            'sessionMw',
          ])
        }
      )
    })
  })

  describe('addGlobalMiddleware', () => {
    // Global middleware belongs to no wire group: the instance map and the
    // globalFiles set are the only record that the file must be imported. When
    // ids collided, an app file registering a global middleware was erased by
    // the generated auth scaffold registering its own — so the app's module was
    // never imported, its registration never ran, and every authenticated route
    // 401'd against a clean build log.
    test('a file whose only registration is global is recorded', async () => {
      await withProject(
        'pikku-mw-global-only-',
        {
          'global.middleware.ts': [
            "import { addGlobalMiddleware, pikkuMiddleware } from '#pikku'",
            'const mw = pikkuMiddleware(async (_s, _w, next) => {',
            '  await next()',
            '})',
            'addGlobalMiddleware([mw])',
          ],
        },
        (state) => {
          const globals = Object.entries(state.middleware.instances).filter(
            ([id]) => id.startsWith('global:')
          )
          assert.equal(globals.length, 1)
          assert.equal(globals[0][1].definitionId, 'mw')
          assert.equal(
            [...state.middleware.globalFiles].filter((f) =>
              f.endsWith('global.middleware.ts')
            ).length,
            1,
            'the file must be in globalFiles, which is what codegen imports from'
          )
        }
      )
    })

    test('an app file and the auth scaffold both keep their global entries', async () => {
      await withProject(
        'pikku-mw-global-collide-',
        {
          // Named so the app file sorts before the scaffold, as it does in a
          // real project (src/middleware/... before src/scaffold/...): the
          // scaffold was visited last and won.
          'app-global.middleware.ts': [
            "import { addGlobalMiddleware, pikkuMiddleware } from '#pikku'",
            'const appMw = pikkuMiddleware(async (_s, _w, next) => {',
            '  await next()',
            '})',
            'addGlobalMiddleware([appMw])',
          ],
          'scaffold-auth-middleware.gen.ts': [
            "import { addGlobalMiddleware, pikkuMiddleware } from '#pikku'",
            'const authA = pikkuMiddleware(async (_s, _w, next) => {',
            '  await next()',
            '})',
            'const authB = pikkuMiddleware(async (_s, _w, next) => {',
            '  await next()',
            '})',
            'addGlobalMiddleware([authA, authB])',
          ],
        },
        (state) => {
          const globals = Object.entries(state.middleware.instances).filter(
            ([id]) => id.startsWith('global:')
          )
          assert.deepEqual(
            globals.map(([, instance]) => instance.definitionId).sort(),
            ['appMw', 'authA', 'authB'],
            'no global registration may be overwritten by another file'
          )
          assert.equal(
            new Set(globals.map(([id]) => id)).size,
            3,
            'three registrations need three ids'
          )
          assert.equal(state.middleware.globalFiles.size, 2)
        }
      )
    })
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
