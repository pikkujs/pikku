import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { pikkuAnalytics } from './pikku-command-analytics.js'

const tempDirs: string[] = []

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const project = async ({ withEvents = true }: { withEvents?: boolean } = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-analytics-'))
  tempDirs.push(root)
  await mkdir(join(root, 'src', 'scaffold', 'analytics'), { recursive: true })
  if (withEvents) {
    await writeFile(
      join(root, 'src', 'analytics-events.ts'),
      `import { z } from 'zod'\nexport const analyticsEvent = z.object({ name: z.literal('page_viewed') })\n`
    )
  }
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
    analyticsSchemasFile: join(
      root,
      'src/scaffold/analytics/analytics.schemas.gen.ts'
    ),
    analyticsEventsFile: join(root, 'src/analytics-events.ts'),
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

    assert.equal(await run({ logger, config: cfg, variables: variables() }), true)
    assert.ok(existsSync(cfg.analyticsFile))
    assert.ok(existsSync(cfg.analyticsSchemasFile))

    const functions = await readFile(cfg.analyticsFile, 'utf8')
    assert.match(functions, /route: '\/analytics'/)
    const schemas = await readFile(cfg.analyticsSchemasFile, 'utf8')
    // Reached back out of scaffold/analytics/ to the project's own union.
    assert.match(
      schemas,
      /import \{ analyticsEvent \} from '\.\.\/\.\.\/analytics-events\.js'/
    )
  })

  // Deploy plan runs codegen once per unit with outDir redirected, so writing
  // scaffold source then would rewrite the developer's tree to import out of
  // .deploy/. Every scaffold generator has to decline.
  test('declines during a per-unit deploy codegen run', async () => {
    const root = await project()
    const cfg = config(root)

    assert.equal(
      await run({ logger, config: cfg, variables: variables('1') }),
      false
    )
    assert.equal(existsSync(cfg.analyticsFile), false)
  })

  test('declines when the scaffold is not enabled', async () => {
    const root = await project()
    const cfg = config(root, { scaffold: {} })

    assert.equal(await run({ logger, config: cfg, variables: variables() }), false)
    assert.equal(existsSync(cfg.analyticsFile), false)
  })

  test('declines when a required output path is unset', async () => {
    const root = await project()
    for (const missing of [
      'analyticsFile',
      'analyticsSchemasFile',
      'analyticsEventsFile',
    ]) {
      const cfg = config(root, { [missing]: undefined })
      assert.equal(
        await run({ logger, config: cfg, variables: variables() }),
        false,
        `${missing} unset should decline`
      )
    }
  })

  // The generated wire imports the union, so emitting one without it would fail
  // to typecheck and point at generated code. The error has to name the file the
  // project actually has to write.
  test('refuses, naming the path, when the event union is missing', async () => {
    const root = await project({ withEvents: false })
    const cfg = config(root)
    errors.length = 0

    assert.equal(await run({ logger, config: cfg, variables: variables() }), false)
    assert.equal(existsSync(cfg.analyticsFile), false)
    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /analytics-events\.ts/)
    assert.match(errors[0]!, /analyticsEvent/)
  })

  test('resolves a relative events path against rootDir', async () => {
    const root = await project()
    const cfg = config(root, { analyticsEventsFile: 'src/analytics-events.ts' })

    assert.equal(await run({ logger, config: cfg, variables: variables() }), true)
    assert.ok(existsSync(cfg.analyticsFile))
  })
})
