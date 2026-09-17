import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, readFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { pikkuMiddleware } from './pikku-command-middleware.js'

const tempDirs: string[] = []

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const project = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-middleware-'))
  tempDirs.push(root)
  await mkdir(join(root, '.pikku'), { recursive: true })
  return root
}

const config = (root: string) =>
  ({
    rootDir: root,
    outDir: join(root, '.pikku'),
    packageMappings: {},
    middlewareFile: join(root, '.pikku', 'pikku-middleware.gen.ts'),
    middlewareGroupsMetaJsonFile: join(root, '.pikku', 'groups-meta.json'),
  }) as never

const logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
} as never

/**
 * A project whose only middleware is `addGlobalMiddleware([...])` over
 * middleware defined in a package: no http group, no tag group, no local
 * definition. `globalFiles` is the modern record of it; `instances` is what an
 * inspector from before `globalFiles` existed would leave behind. Either one
 * has to be enough on its own, because the serializer reads both.
 */
const state = (middleware: Record<string, unknown>) =>
  async () =>
    ({
      middleware: {
        definitions: {},
        instances: {},
        tagMiddleware: new Map(),
        globalFiles: new Set<string>(),
        ...middleware,
      },
      http: { routeMiddleware: new Map(), files: new Set() },
      channelMiddleware: { definitions: {}, tagMiddleware: new Map() },
      middlewareGroupsMeta: {},
    }) as never

const run = (getInspectorState: unknown, root: string) =>
  (pikkuMiddleware as unknown as { func: Function }).func(
    { logger, config: config(root), getInspectorState },
    undefined,
    {}
  )

describe('pikkuMiddleware', () => {
  test('writes the middleware file when globalFiles is all there is', async () => {
    const root = await project()
    const sessionBridge = join(root, 'src', 'session.ts')

    const generated = await run(
      state({ globalFiles: new Set([sessionBridge]) }),
      root
    )

    assert.equal(
      generated,
      true,
      'the command reported it generated nothing, so a caller that gates on ' +
        'the return value skips the file that carries the only auth there is'
    )
    const written = await readFile(
      join(root, '.pikku', 'pikku-middleware.gen.ts'),
      'utf-8'
    )
    assert.match(
      written,
      /session\.js/,
      'the global middleware file is not side-effect imported, so its ' +
        'addGlobalMiddleware call never runs'
    )
    await readFile(join(root, '.pikku', 'groups-meta.json'), 'utf-8')
  })

  test('writes it for a state serialized before globalFiles existed', async () => {
    const root = await project()
    const sessionBridge = join(root, 'src', 'session.ts')

    const generated = await run(
      state({
        globalFiles: undefined,
        instances: {
          'global:0': { definitionId: 'session', sourceFile: sessionBridge },
        },
      }),
      root
    )

    assert.equal(generated, true)
    const written = await readFile(
      join(root, '.pikku', 'pikku-middleware.gen.ts'),
      'utf-8'
    )
    assert.match(written, /session\.js/)
  })

  test('writes nothing when the project has no middleware at all', async () => {
    const root = await project()
    const generated = await run(state({}), root)
    assert.equal(generated, false)
  })
})
