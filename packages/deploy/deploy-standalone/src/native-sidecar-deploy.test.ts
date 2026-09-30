import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { StandaloneProviderAdapter } from './adapter.js'
import { SIDECAR_NAME } from './tauri/rust.js'
import { sidecarFileName } from './tauri/target-triple.js'

const tempDirs: string[] = []

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const silentLogger = { info: () => {}, error: () => {} }

const builtUnit = async () => {
  const buildDir = await mkdtemp(join(tmpdir(), 'pikku-native-deploy-'))
  tempDirs.push(buildDir)
  const unitDir = join(buildDir, 'shop')
  await mkdir(unitDir, { recursive: true })
  await writeFile(join(unitDir, 'bundle.js'), 'console.log("bundle")\n')

  const appDir = await mkdtemp(join(tmpdir(), 'pikku-native-app-'))
  tempDirs.push(appDir)
  return {
    buildDir,
    nativeDir: join(appDir, 'src-tauri'),
    outDir: join(buildDir, 'shop-dist'),
  }
}

describe('installing the compiled server into native apps', () => {
  test('refuses without the bun runtime, since there is no binary to install', async () => {
    const { buildDir, nativeDir } = await builtUnit()

    const result = await new StandaloneProviderAdapter({
      runtime: 'node',
      nativeSidecars: [{ name: 'pos', dir: nativeDir }],
    }).deploy({ buildDir, logger: silentLogger })

    assert.equal(result.success, false)
    assert.match(result.errors[0]!.error, /pos.*bundleServer.*--runtime bun/s)
  })

  test('installs the compiled binary under the name externalBin resolves', async () => {
    const { buildDir, nativeDir, outDir } = await builtUnit()

    const result = await new StandaloneProviderAdapter({
      runtime: 'bun',
      nativeSidecars: [{ name: 'pos', dir: nativeDir }],
    }).deploy({ buildDir, logger: silentLogger })

    assert.deepEqual(result.errors, [])
    const installed = join(
      nativeDir,
      'binaries',
      sidecarFileName(SIDECAR_NAME, result.targetTriple!)
    )
    assert.ok(
      (await readFile(join(outDir, 'shop'))).equals(await readFile(installed))
    )
    assert.notEqual((await stat(installed)).mode & 0o111, 0)
  })

  test('a plain standalone deploy touches no native app', async () => {
    const { buildDir, nativeDir } = await builtUnit()

    const result = await new StandaloneProviderAdapter({
      runtime: 'bun',
    }).deploy({ buildDir, logger: silentLogger })

    assert.equal(result.targetTriple, undefined)
    await assert.rejects(() => stat(nativeDir))
  })
})
