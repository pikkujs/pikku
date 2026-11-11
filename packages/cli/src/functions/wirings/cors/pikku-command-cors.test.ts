import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { pikkuCors, siblingSpecifier } from './pikku-command-cors.js'

const tempDirs: string[] = []
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

const project = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-cors-'))
  tempDirs.push(root)
  await mkdir(join(root, 'src', 'scaffold', 'cors'), { recursive: true })
  return root
}

const config = (root: string, extra: Record<string, unknown> = {}) =>
  ({
    rootDir: root,
    outDir: join(root, '.pikku'),
    packageMappings: {},
    scaffold: { cors: true },
    corsFile: join(root, 'src/scaffold/cors/cors.gen.ts'),
    corsOriginsFile: join(root, 'src/scaffold/cors/cors-origins.gen.ts'),
    ...extra,
  }) as never

const logger = { error() {}, warn() {}, info() {}, debug() {} } as never
const variables = (flag?: string) => ({ get: async () => flag }) as never
const run = (services: Record<string, unknown>) =>
  (pikkuCors as unknown as { func: Function }).func(services, undefined, {})

describe('pikkuCors', () => {
  test('writes the origins helper and the middleware', async () => {
    const root = await project()
    const cfg = config(root, {
      frontends: { app: { primary: true, dev: { port: 5173 } } },
    })
    assert.equal(
      await run({ logger, config: cfg, variables: variables() }),
      true
    )
    const origins = await readFile(cfg.corsOriginsFile, 'utf8')
    assert.match(origins, /http:\/\/localhost:5173/)
    const middleware = await readFile(cfg.corsFile, 'utf8')
    assert.match(middleware, /from '\.\/cors-origins\.gen\.js'/)
  })

  test('the analytics origin lock alone writes the helper but no middleware', async () => {
    const root = await project()
    const cfg = config(root, {
      scaffold: { analytics: true },
      corsFile: undefined,
    })
    assert.equal(
      await run({ logger, config: cfg, variables: variables() }),
      true
    )
    assert.ok(existsSync(cfg.corsOriginsFile))
    assert.equal(existsSync(join(root, 'src/scaffold/cors/cors.gen.ts')), false)
  })

  test('with the lock off and cors off, nothing is written', async () => {
    const root = await project()
    const cfg = config(root, {
      scaffold: { analytics: { originLock: false } },
      corsFile: undefined,
    })
    assert.equal(
      await run({ logger, config: cfg, variables: variables() }),
      false
    )
    assert.equal(existsSync(cfg.corsOriginsFile), false)
  })

  test('turning cors off removes the files it generated, not hand-written ones', async () => {
    const root = await project()
    const generated = config(root)
    await run({ logger, config: generated, variables: variables() })
    const off = config(root, { scaffold: {} })
    await run({ logger, config: off, variables: variables() })
    assert.equal(existsSync(off.corsFile), false)
    assert.equal(existsSync(off.corsOriginsFile), false)

    await writeFile(off.corsFile, 'export const mine = 1\n')
    await run({ logger, config: off, variables: variables() })
    assert.ok(existsSync(off.corsFile), 'a hand-written file must survive')
  })

  test('declines during a per-unit deploy codegen run', async () => {
    const root = await project()
    const cfg = config(root)
    assert.equal(
      await run({ logger, config: cfg, variables: variables('1') }),
      false
    )
    assert.equal(existsSync(cfg.corsFile), false)
  })

  test('an explicit scaffold.cors.port overrides the frontend', async () => {
    const root = await project()
    const cfg = config(root, {
      scaffold: { cors: { port: 9000 } },
      frontends: { app: { primary: true, dev: { port: 5173 } } },
    })
    await run({ logger, config: cfg, variables: variables() })
    assert.match(await readFile(cfg.corsOriginsFile, 'utf8'), /localhost:9000/)
  })
})

describe('siblingSpecifier', () => {
  test('is a ./ ESM specifier with a .js extension', () => {
    assert.equal(
      siblingSpecifier(
        '/p/a/analytics-origin.gen.ts',
        '/p/a/cors-origins.gen.ts'
      ),
      './cors-origins.gen.js'
    )
    assert.equal(
      siblingSpecifier('/p/analytics/x.gen.ts', '/p/cors/cors-origins.gen.ts'),
      '../cors/cors-origins.gen.js'
    )
  })
})
