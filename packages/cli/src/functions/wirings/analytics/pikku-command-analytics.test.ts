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
    srcDirectories: ['src'],
    outDir: join(root, '.pikku'),
    packageMappings: {},
    scaffold: { analytics: true },
    analyticsFile: join(root, 'src/scaffold/analytics/analytics.gen.ts'),
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
})
