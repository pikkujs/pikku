import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { findNativeAddons, nativeAddonBundleError } from './native-addon.js'

describe('findNativeAddons', () => {
  let dir: string

  const writePackage = async (
    path: string,
    manifest: Record<string, unknown>
  ) => {
    const root = join(dir, path)
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify(manifest))
    return root
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pikku-native-addon-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('names the package behind a wall of unresolved builtins', async () => {
    const root = await writePackage('node_modules/sharp', {
      name: 'sharp',
      optionalDependencies: {
        '@img/sharp-linux-x64': '1.3.2',
        '@img/sharp-darwin-arm64': '1.3.2',
      },
    })

    const hits = await findNativeAddons(
      `Could not resolve "node:util" @ ${root}/dist/constructor.mjs\n` +
        `Could not resolve "node:child_process" @ ${root}/dist/libvips.mjs`
    )

    assert.deepEqual(
      hits.map((h) => h.packageName),
      ['sharp']
    )
    assert.match(hits[0]!.evidence, /per-platform packages/)
  })

  test('resolves the package, not the content-addressed store above it', async () => {
    const root = await writePackage(
      'node_modules/.bun/sharp@0.35.3+496e088b/node_modules/sharp',
      { name: 'sharp', gypfile: true }
    )

    const hits = await findNativeAddons(`Could not resolve "node:util" @ ${root}/dist/x.mjs`)

    assert.deepEqual(
      hits.map((h) => h.packageName),
      ['sharp']
    )
  })

  test('a prebuilt binary declaration counts', async () => {
    const root = await writePackage('node_modules/onnxruntime-node', {
      name: 'onnxruntime-node',
      binary: { napi_versions: [6] },
    })

    const hits = await findNativeAddons(
      `Could not resolve "node:path" @ ${root}/lib/index.js`
    )
    assert.match(hits[0]!.evidence, /prebuilt native binary/)
  })

  test('a plain package is not reported', async () => {
    const root = await writePackage('node_modules/lodash', { name: 'lodash' })
    assert.deepEqual(
      await findNativeAddons(`Could not resolve "node:fs" @ ${root}/index.js`),
      []
    )
  })

  test('a path that is not a package root is skipped rather than guessed at', async () => {
    assert.deepEqual(
      await findNativeAddons(
        `Could not resolve "node:util" @ ${dir}/node_modules/gone/dist/x.mjs`
      ),
      []
    )
  })

  test('an os restriction alone is not a native addon', async () => {
    const root = await writePackage('node_modules/fsevents-ish', {
      name: 'fsevents-ish',
      os: ['darwin'],
    })

    assert.deepEqual(
      await findNativeAddons(
        `Could not resolve "node:events" @ ${root}/index.js`
      ),
      [],
      'a pure-JS package pinned to one platform carries no binary'
    )
  })

  test('a failure that resolved everything is not diagnosed as an addon', async () => {
    const root = await writePackage('node_modules/sharp', {
      name: 'sharp',
      gypfile: true,
    })

    assert.deepEqual(
      await findNativeAddons(
        `Expected ")" but found ";" @ ${root}/dist/constructor.mjs`
      ),
      [],
      'a syntax error in a native package is still a syntax error'
    )
  })
})

describe('nativeAddonBundleError', () => {
  test('names the package, the reason, and the way out', () => {
    const message = nativeAddonBundleError('enrich-candidate', [
      { packageName: 'sharp', evidence: 'ships its binary in per-platform packages' },
    ])
    assert.match(message, /enrich-candidate/)
    assert.match(message, /sharp/)
    assert.match(message, /serverlessIncompatible/)
    assert.match(message, /deploy: "server"/)
  })
})
