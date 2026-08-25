import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { StandaloneProviderAdapter } from './adapter.js'

const baseContext = {
  unit: { name: 'app', role: 'function' },
  unitDir: '/build/app',
  bootstrapPath: './.pikku/pikku-bootstrap.gen.js',
  configImport: `import { createConfig } from './config.js'`,
  configVar: 'createConfig',
  servicesImport: `import { createSingletonServices } from './services.js'`,
  servicesVar: 'createSingletonServices',
  singletonServicesImport: '',
  servicesType: 'Record<string, unknown>',
  mcpImport: '',
  mcpServerOption: '',
} as never

const withFrontend = {
  ...(baseContext as object),
  frontend: { urlPrefix: '/', spaFallback: true },
} as never

describe('StandaloneProviderAdapter frontend serving', () => {
  test('a node entry without a frontend mounts nothing', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(baseContext)

    assert.doesNotMatch(source, /staticMounts/)
  })

  test('a bun entry without a frontend imports no asset manifest', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).generateEntrySource(baseContext)

    assert.doesNotMatch(source, /frontend-assets/)
    assert.doesNotMatch(source, /staticMounts/)
  })

  test('a node entry serves the frontend from a directory beside the bundle', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'node',
    }).generateEntrySource(withFrontend)

    assert.match(source, /staticMounts/)
    assert.match(
      source,
      /import\.meta\.url/,
      'the directory must be resolved from the running bundle, not the build machine'
    )
    assert.doesNotMatch(
      source,
      /assets:/,
      'node reads the copied directory rather than an embed map'
    )
  })

  test('a bun entry serves the frontend from the embedded asset map', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).generateEntrySource(withFrontend)

    assert.match(source, /from '\.\/frontend-assets\.gen\.js'/)
    assert.match(source, /assets:/)
    assert.doesNotMatch(
      source,
      /import\.meta\.url/,
      'an embedded asset has no directory to resolve'
    )
  })

  test('the mount carries the configured prefix and fallback', () => {
    const source = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).generateEntrySource({
      ...(baseContext as object),
      frontend: { urlPrefix: '/app', spaFallback: false },
    } as never)

    assert.match(source, /urlPrefix: '\/app'/)
    assert.match(source, /spaFallback: false/)
  })

  test('bun externalises the asset manifest so esbuild never parses it', () => {
    // esbuild rejects `with { type: 'file' }` outright; the manifest has to
    // survive to the `bun build --compile` step untouched.
    const externals = new StandaloneProviderAdapter({
      runtime: 'bun',
    }).getExternals()

    assert.ok(externals.includes('./frontend-assets.gen.js'))
  })

  test('the node runtime has no manifest to externalise', () => {
    const externals = new StandaloneProviderAdapter({
      runtime: 'node',
    }).getExternals()

    assert.ok(!externals.includes('./frontend-assets.gen.js'))
  })
})

describe('StandaloneProviderAdapter deploy output', () => {
  const tempDirs: string[] = []

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const builtUnit = async (options: { withFrontend: boolean }) => {
    const buildDir = await mkdtemp(join(tmpdir(), 'pikku-standalone-'))
    tempDirs.push(buildDir)
    const unitDir = join(buildDir, 'app')
    await mkdir(unitDir, { recursive: true })
    await writeFile(join(unitDir, 'bundle.js'), 'console.log("bundle")')
    if (options.withFrontend) {
      await mkdir(join(unitDir, 'frontend', 'assets'), { recursive: true })
      await writeFile(
        join(unitDir, 'frontend', 'index.html'),
        '<!doctype html>'
      )
      await writeFile(join(unitDir, 'frontend', 'assets', 'app.js'), 'app')
      await writeFile(
        join(unitDir, 'frontend-assets.gen.js'),
        'export const frontendAssets = {}\n'
      )
    }
    return { buildDir, outDir: join(buildDir, 'app-dist') }
  }

  const silentLogger = { info: () => {}, error: () => {} }

  test('ships the frontend beside the bundle', async () => {
    // The node entry resolves its mount directory relative to itself, so the
    // copy has to land in the distributable, not just in the build directory.
    const { buildDir, outDir } = await builtUnit({ withFrontend: true })

    const result = await new StandaloneProviderAdapter({
      runtime: 'node',
    }).deploy({ buildDir, logger: silentLogger })

    assert.equal(result.success, true)
    assert.equal(
      await readFile(join(outDir, 'frontend', 'assets', 'app.js'), 'utf-8'),
      'app'
    )
  })

  test('ships the asset manifest the compile step still has to resolve', async () => {
    // `bun build --compile` follows the import out of the copied bundle, so the
    // manifest has to sit next to it — it was excluded from the esbuild output
    // precisely so it would still be a real file at this point.
    const { buildDir, outDir } = await builtUnit({ withFrontend: true })

    await new StandaloneProviderAdapter({ runtime: 'node' }).deploy({
      buildDir,
      logger: silentLogger,
    })

    assert.match(
      await readFile(join(outDir, 'frontend-assets.gen.js'), 'utf-8'),
      /frontendAssets/
    )
  })

  test('a project without a frontend copies nothing extra', async () => {
    const { buildDir, outDir } = await builtUnit({ withFrontend: false })

    const result = await new StandaloneProviderAdapter({
      runtime: 'node',
    }).deploy({ buildDir, logger: silentLogger })

    assert.equal(result.success, true)
    assert.equal(existsSync(join(outDir, 'frontend')), false)
    assert.equal(existsSync(join(outDir, 'frontend-assets.gen.js')), false)
  })
})
