import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, readFile } from 'node:fs/promises'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { pikkuAnalytics } from './pikku-command-analytics.js'
import { analyticsSchemasFile } from '../../../utils/analytics-schemas-file.js'

const tempDirs: string[] = []

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const project = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-analytics-'))
  tempDirs.push(root)
  await mkdir(join(root, 'src', 'scaffold', 'analytics'), { recursive: true })
  return root
}

const config = (root: string, extra: Record<string, unknown> = {}) =>
  ({
    rootDir: root,
    sourceDirs: ['src'],
    outDir: join(root, '.pikku'),
    packageMappings: {},
    scaffold: { analytics: true },
    analyticsFile: join(root, 'src/scaffold/analytics/analytics.gen.ts'),
    analyticsOriginFile: join(
      root,
      'src/scaffold/analytics/analytics-origin.gen.ts'
    ),
    corsOriginsFile: join(root, 'src/scaffold/cors/cors-origins.gen.ts'),
    analyticsMetaJsonFile: join(
      root,
      '.pikku/analytics/pikku-analytics-meta.gen.json'
    ),
    analyticsMetaFile: join(
      root,
      '.pikku/analytics/pikku-analytics-meta.gen.ts'
    ),
    ...extra,
  }) as never

const errors: string[] = []
const logger = {
  error: (message: string) => errors.push(message),
  warn() {},
  info() {},
  debug() {},
} as never

const variables = (flag?: string | number) =>
  ({ get: async () => flag }) as never

/** The project declared its analytics; `undefined` means it did not. */
const getInspectorState =
  (analytics?: Array<{ file: string; variable: string; events: string[] }>) =>
  async () =>
    ({ analytics }) as never

const declared = (
  root: string,
  variable = 'analyticsEvents',
  events = ['page_viewed'],
  file = 'analytics.ts'
) => [{ file: join(root, 'src', file), variable, events }]

const run = (services: Record<string, unknown>) =>
  (pikkuAnalytics as unknown as { func: Function }).func(
    services,
    undefined,
    {}
  )

describe('pikkuAnalytics', () => {
  test('writes the ingest and its schemas, and reports it did', async () => {
    const root = await project()
    const cfg = config(root)

    assert.equal(
      await run({
        logger,
        config: cfg,
        variables: variables(),
        getInspectorState: getInspectorState(declared(root)),
      }),
      true
    )
    assert.ok(existsSync(cfg.analyticsFile))
    const schemasFile = analyticsSchemasFile(cfg.analyticsFile)!
    assert.ok(existsSync(schemasFile))

    const functions = await readFile(cfg.analyticsFile, 'utf8')
    assert.match(functions, /route: '\/analytics'/)
    const schemas = await readFile(schemasFile, 'utf8')
    // Reached back out of scaffold/analytics/ to the project's own declaration.
    assert.match(
      schemas,
      /import \{ analyticsEvents as events0 \} from '\.\.\/\.\.\/analytics\.js'/
    )
  })

  // The declaration is an ordinary export, so its name is the project's to
  // choose — the generated import has to follow it rather than assume one.
  test('follows the name the declaration is exported under', async () => {
    const root = await project()
    const cfg = config(root)

    await run({
      logger,
      config: cfg,
      variables: variables(),
      getInspectorState: getInspectorState(declared(root, 'usage')),
    })

    const schemas = await readFile(
      analyticsSchemasFile(cfg.analyticsFile)!,
      'utf8'
    )
    assert.match(schemas, /import \{ usage as events0 \} from/)
    assert.match(schemas, /events0\['page_viewed'\]\.shape/)
  })

  // `.extend` overwrites, so whichever side goes last wins. An app's own
  // `name` prop taking the discriminator's place leaves `z.discriminatedUnion`
  // with a non-literal key, which throws the moment the module is imported.
  test('attaches the event name last, so a declared prop cannot take it', async () => {
    const root = await project()
    const cfg = config(root)

    await run({
      logger,
      config: cfg,
      variables: variables(),
      getInspectorState: getInspectorState(declared(root)),
    })

    const schemas = await readFile(
      analyticsSchemasFile(cfg.analyticsFile)!,
      'utf8'
    )
    assert.match(
      schemas,
      /z\s+\.object\(events0\['page_viewed'\]\.shape\)\s+\.extend\(\{ name: z\.literal\('page_viewed'\) \}\)/
    )
  })

  // Deploy plan runs codegen once per unit with outDir redirected, so writing
  // scaffold source then would rewrite the developer's tree to import out of
  // .deploy/. Every scaffold generator has to decline.
  test('declines during a per-unit deploy codegen run', async () => {
    const root = await project()
    const cfg = config(root)

    assert.equal(
      await run({
        logger,
        config: cfg,
        variables: variables('1'),
        getInspectorState: getInspectorState(declared(root)),
      }),
      false
    )
    assert.equal(existsSync(cfg.analyticsFile), false)
  })

  test('declines when the scaffold is not enabled', async () => {
    const root = await project()
    const cfg = config(root, { scaffold: {} })

    assert.equal(
      await run({
        logger,
        config: cfg,
        variables: variables(),
        getInspectorState: getInspectorState(declared(root)),
      }),
      false
    )
    assert.equal(existsSync(cfg.analyticsFile), false)
  })

  test('declines when the output path is unset', async () => {
    const root = await project()
    const cfg = config(root, { analyticsFile: undefined })

    assert.equal(
      await run({
        logger,
        config: cfg,
        variables: variables(),
        getInspectorState: getInspectorState(declared(root)),
      }),
      false
    )
  })

  // The generated wire imports the declaration, so emitting one without it
  // would fail to typecheck and point at generated code. The error has to name
  // the one thing the project actually has to write.
  test('refuses, naming the call, when nothing is declared', async () => {
    const root = await project()
    const cfg = config(root)
    errors.length = 0

    assert.equal(
      await run({
        logger,
        config: cfg,
        variables: variables(),
        getInspectorState: getInspectorState(undefined),
      }),
      false
    )
    assert.equal(existsSync(cfg.analyticsFile), false)
    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /defineAnalyticsEvents/)
  })

  // A configured `scaffold.analytics.path` moves the ingest, and the schemas
  // module has to move with it — the generated wire imports it as a sibling.
  test('writes the schemas beside a relocated ingest', async () => {
    const root = await project()
    await mkdir(join(root, 'src', 'elsewhere'), { recursive: true })
    const cfg = config(root, {
      analyticsFile: join(root, 'src/elsewhere/analytics.gen.ts'),
    })

    assert.equal(
      await run({
        logger,
        config: cfg,
        variables: variables(),
        getInspectorState: getInspectorState(declared(root)),
      }),
      true
    )
    assert.ok(
      existsSync(join(root, 'src/elsewhere/analytics.schemas.gen.ts')),
      'schemas must sit beside the relocated ingest'
    )
    const functions = await readFile(cfg.analyticsFile, 'utf8')
    assert.match(functions, /from '\.\/analytics\.schemas\.gen\.js'/)
  })

  test('writes the origin lock by default, over the shared allowlist', async () => {
    const root = await project()
    const cfg = config(root)

    await run({
      logger,
      config: cfg,
      variables: variables(),
      getInspectorState: getInspectorState(declared(root)),
    })

    const lock = await readFile(cfg.analyticsOriginFile, 'utf8')
    assert.match(lock, /addHTTPMiddleware\('\/analytics'/)
    assert.match(lock, /requireOrigin/)
    assert.match(lock, /from '\.\.\/cors\/cors-origins\.gen\.js'/)
  })

  test('originLock: false writes no lock, and removes one it wrote before', async () => {
    const root = await project()
    const on = config(root)
    const state = getInspectorState(declared(root))
    await run({
      logger,
      config: on,
      variables: variables(),
      getInspectorState: state,
    })
    assert.ok(existsSync(on.analyticsOriginFile))

    const off = config(root, { scaffold: { analytics: { originLock: false } } })
    await run({
      logger,
      config: off,
      variables: variables(),
      getInspectorState: state,
    })
    assert.equal(existsSync(off.analyticsOriginFile), false)
    assert.ok(existsSync(off.analyticsFile), 'the ingest itself stays')
  })

  test('the lock is refused, not silently skipped, without an allowlist file', async () => {
    const root = await project()
    const cfg = config(root, { corsOriginsFile: undefined })
    errors.length = 0

    await run({
      logger,
      config: cfg,
      variables: variables(),
      getInspectorState: getInspectorState(declared(root)),
    })
    assert.equal(existsSync(cfg.analyticsOriginFile), false)
    assert.match(errors[0]!, /originLock/)
  })
})

describe('the analytics meta a bundle imports', () => {
  const generate = async (
    flag?: string,
    extra: Record<string, unknown> = {},
    events = ['page_viewed', 'checkout_completed']
  ) => {
    const root = await project()
    const cfg = config(root, extra)
    await run({
      logger,
      config: cfg,
      variables: variables(flag),
      getInspectorState: getInspectorState(
        declared(root, 'analyticsEvents', events)
      ),
    })
    return cfg
  }

  test('registers the declared names in runtime state through the bootstrap module', async () => {
    const cfg = await generate()
    const module = await readFile(cfg.analyticsMetaFile, 'utf8')
    assert.match(
      module,
      /import metaData from '\.\/pikku-analytics-meta\.gen\.json'/
    )
    assert.match(module, /pikkuState\(null, 'analytics', 'meta', metaData/)
  })

  test('ships names only, keeping the declaration path in the verbose sibling', async () => {
    const cfg = await generate()
    assert.deepEqual(
      JSON.parse(await readFile(cfg.analyticsMetaJsonFile, 'utf8')),
      {
        page_viewed: { name: 'page_viewed' },
        checkout_completed: { name: 'checkout_completed' },
      }
    )
    const verbose = JSON.parse(
      await readFile(
        cfg.analyticsMetaJsonFile.replace('.gen.json', '-verbose.gen.json'),
        'utf8'
      )
    )
    assert.equal(verbose.page_viewed.variable, 'analyticsEvents')
    assert.ok(verbose.page_viewed.file.endsWith('/src/analytics.ts'))
  })

  // A deploy unit's bootstrap is written by a deploy codegen pass, so the meta
  // has to be written there too or the bundle registers nothing.
  test('is written during a per-unit deploy codegen run', async () => {
    const cfg = await generate('1')
    assert.ok(existsSync(cfg.analyticsMetaFile))
    assert.equal(existsSync(cfg.analyticsFile), false)
  })

  test('is written with the scaffold off', async () => {
    const cfg = await generate(undefined, { scaffold: {} })
    assert.ok(existsSync(cfg.analyticsMetaFile))
  })

  test('registers an empty set when nothing is declared, so the import still resolves', async () => {
    const cfg = await generate(undefined, { scaffold: {} }, [])
    assert.deepEqual(
      JSON.parse(await readFile(cfg.analyticsMetaJsonFile, 'utf8')),
      {}
    )
    assert.ok(existsSync(cfg.analyticsMetaFile))
  })

  test('an addon writes the JSON but no module registering into the host', async () => {
    const cfg = await generate(undefined, { addon: true })
    assert.ok(existsSync(cfg.analyticsMetaJsonFile))
    assert.equal(existsSync(cfg.analyticsMetaFile), false)
  })

  test('uses an import attribute when the runtime supports one', async () => {
    const cfg = await generate(undefined, {
      schema: { supportsImportAttributes: true },
    })
    assert.match(
      await readFile(cfg.analyticsMetaFile, 'utf8'),
      /with \{ type: 'json' \}/
    )
  })
})
