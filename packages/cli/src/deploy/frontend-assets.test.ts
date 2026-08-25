import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'

import {
  collectFrontendAssets,
  generateFrontendAssetManifest,
  materializeFrontend,
  FRONTEND_ASSET_MANIFEST_FILE,
} from './frontend-assets.js'

describe('collectFrontendAssets', () => {
  const tempDirs: string[] = []

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const builtFrontend = async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-fe-assets-'))
    tempDirs.push(root)
    await writeFile(join(root, 'index.html'), '<!doctype html>')
    await mkdir(join(root, 'assets'), { recursive: true })
    await writeFile(join(root, 'assets', 'app-a1b2c3.js'), 'app')
    await writeFile(join(root, 'assets', 'app-d4e5f6.css'), 'css')
    await mkdir(join(root, 'assets', 'fonts'), { recursive: true })
    await writeFile(join(root, 'assets', 'fonts', 'inter.woff2'), 'font')
    return root
  }

  test('walks nested directories and keys every file by its request path', async () => {
    const dir = await builtFrontend()

    assert.deepEqual(
      (await collectFrontendAssets(dir)).map((a) => a.key),
      [
        'assets/app-a1b2c3.js',
        'assets/app-d4e5f6.css',
        'assets/fonts/inter.woff2',
        'index.html',
      ]
    )
  })

  test('keys are ordered deterministically', async () => {
    // The manifest is an input to a reproducible build; directory read order is
    // not stable across filesystems, so the walk must impose its own.
    const dir = await builtFrontend()

    const first = (await collectFrontendAssets(dir)).map((a) => a.key)
    const second = (await collectFrontendAssets(dir)).map((a) => a.key)
    assert.deepEqual(first, second)
    assert.deepEqual(first, [...first].sort())
  })

  test('every asset carries an absolute path to the real file', async () => {
    const dir = await builtFrontend()

    const assets = await collectFrontendAssets(dir)
    const shell = assets.find((a) => a.key === 'index.html')
    assert.equal(shell?.path, join(dir, 'index.html'))
  })

  test('an empty directory collects nothing rather than throwing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-fe-assets-'))
    tempDirs.push(root)

    assert.deepEqual(await collectFrontendAssets(root), [])
  })
})

describe('generateFrontendAssetManifest', () => {
  const assets = [
    {
      key: 'assets/app-a1b2c3.js',
      path: '/build/frontend/assets/app-a1b2c3.js',
    },
    { key: 'index.html', path: '/build/frontend/index.html' },
  ]

  test('emits one literal file import per asset', () => {
    // `with { type: 'file' }` cannot be built at runtime, which is the whole
    // reason this module is generated rather than a directory walk.
    const source = generateFrontendAssetManifest(assets, '/build')

    assert.match(
      source,
      /^import \w+ from '\.\/frontend\/assets\/app-a1b2c3\.js' with \{ type: 'file' \}$/m
    )
    assert.match(
      source,
      /^import \w+ from '\.\/frontend\/index\.html' with \{ type: 'file' \}$/m
    )
    assert.equal(source.match(/with \{ type: 'file' \}/g)?.length, 2)
  })

  test('never emits a dynamic import or a computed specifier', () => {
    const source = generateFrontendAssetManifest(assets, '/build')

    assert.doesNotMatch(source, /import\(/)
    assert.doesNotMatch(source, /`/)
  })

  test('maps each request key to the identifier its file was imported as', () => {
    const source = generateFrontendAssetManifest(assets, '/build')

    const importedAs = new Map(
      [...source.matchAll(/^import (\w+) from '([^']+)'/gm)].map(
        ([, id, spec]) => [spec!, id!]
      )
    )
    assert.match(
      source,
      new RegExp(
        `'assets/app-a1b2c3\\.js': ${importedAs.get('./frontend/assets/app-a1b2c3.js')},`
      )
    )
    assert.match(
      source,
      new RegExp(`'index\\.html': ${importedAs.get('./frontend/index.html')},`)
    )
  })

  test('exports frontendAssets even when there is nothing to embed', () => {
    const source = generateFrontendAssetManifest([], '/build')

    assert.match(source, /export const frontendAssets/)
    assert.doesNotMatch(source, /with \{ type: 'file' \}/)
  })

  test('specifiers stay relative and POSIX-separated', () => {
    const source = generateFrontendAssetManifest(assets, '/build')

    for (const [, spec] of source.matchAll(/^import \w+ from '([^']+)'/gm)) {
      assert.ok(spec!.startsWith('./'), `${spec} should be relative`)
      assert.doesNotMatch(spec!, /\\/)
    }
  })

  test('names the file the deploy pipeline writes it to', () => {
    assert.equal(FRONTEND_ASSET_MANIFEST_FILE, 'frontend-assets.gen.js')
  })
})

describe('materializeFrontend', () => {
  const tempDirs: string[] = []

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const scratch = async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-fe-mat-'))
    tempDirs.push(root)
    const source = join(root, 'built')
    await mkdir(join(source, 'assets'), { recursive: true })
    await writeFile(join(source, 'index.html'), '<!doctype html>')
    await writeFile(join(source, 'assets', 'app-a1b2c3.js'), 'app')
    const unitDir = join(root, 'unit')
    await mkdir(unitDir, { recursive: true })
    return { source, unitDir }
  }

  test('copies the built output into the unit', async () => {
    const { source, unitDir } = await scratch()

    await materializeFrontend(source, unitDir)

    assert.equal(
      await readFile(
        join(unitDir, 'frontend', 'assets', 'app-a1b2c3.js'),
        'utf-8'
      ),
      'app'
    )
  })

  test('writes a manifest whose imports resolve from the unit directory', async () => {
    // The manifest is emitted beside the bundle entry, so its specifiers have
    // to be relative to the unit rather than to wherever the frontend was built.
    const { source, unitDir } = await scratch()

    await materializeFrontend(source, unitDir)

    const manifest = await readFile(
      join(unitDir, FRONTEND_ASSET_MANIFEST_FILE),
      'utf-8'
    )
    assert.match(
      manifest,
      /^import \w+ from '\.\/frontend\/index\.html' with \{ type: 'file' \}$/m
    )
  })

  test('the manifest names the copied files, not the originals', async () => {
    // Embedding has to follow the copy: the build directory is what ships, and
    // the source tree may not even exist on the machine that compiles.
    const { source, unitDir } = await scratch()

    await materializeFrontend(source, unitDir)

    const manifest = await readFile(
      join(unitDir, FRONTEND_ASSET_MANIFEST_FILE),
      'utf-8'
    )
    assert.doesNotMatch(manifest, /built/)
  })

  test('replaces a stale copy rather than merging into it', async () => {
    const { source, unitDir } = await scratch()
    await mkdir(join(unitDir, 'frontend'), { recursive: true })
    await writeFile(join(unitDir, 'frontend', 'ghost.js'), 'from a past build')

    await materializeFrontend(source, unitDir)

    await assert.rejects(() => readFile(join(unitDir, 'frontend', 'ghost.js')))
  })

  test('reports the keys it embedded', async () => {
    const { source, unitDir } = await scratch()

    assert.deepEqual(await materializeFrontend(source, unitDir), [
      'assets/app-a1b2c3.js',
      'index.html',
    ])
  })
})
