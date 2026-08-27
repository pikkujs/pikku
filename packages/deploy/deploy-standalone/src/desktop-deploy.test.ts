import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { StandaloneProviderAdapter } from './adapter.js'
import { sidecarFileName } from './tauri/target-triple.js'

const tempDirs: string[] = []

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const silentLogger = { info: () => {}, error: () => {} }

const builtUnit = async () => {
  const buildDir = await mkdtemp(join(tmpdir(), 'pikku-desktop-deploy-'))
  tempDirs.push(buildDir)
  const unitDir = join(buildDir, 'shop')
  await mkdir(unitDir, { recursive: true })
  await writeFile(join(unitDir, 'bundle.js'), 'console.log("bundle")\n')

  const projectDir = await mkdtemp(join(tmpdir(), 'pikku-desktop-project-'))
  tempDirs.push(projectDir)
  return { buildDir, projectDir, outDir: join(buildDir, 'shop-dist') }
}

describe('deploying a standalone unit as a desktop shell', () => {
  test('refuses without the bun runtime, since there is no binary to ship', async () => {
    const { buildDir, projectDir } = await builtUnit()

    const result = await new StandaloneProviderAdapter({
      runtime: 'node',
      desktop: true,
      projectDir,
    }).deploy({ buildDir, logger: silentLogger })

    assert.equal(result.success, false)
    assert.match(result.errors[0]!.error, /bun/)
  })

  test('refuses when it was not told where the project lives', async () => {
    const { buildDir } = await builtUnit()

    const result = await new StandaloneProviderAdapter({
      runtime: 'bun',
      desktop: true,
    }).deploy({ buildDir, logger: silentLogger })

    assert.equal(result.success, false)
    assert.match(result.errors[0]!.error, /project/i)
  })

  test('generates the shell around the compiled binary', async () => {
    const { buildDir, projectDir, outDir } = await builtUnit()

    const result = await new StandaloneProviderAdapter({
      runtime: 'bun',
      desktop: true,
      projectDir,
    }).deploy({ buildDir, logger: silentLogger })

    assert.deepEqual(result.errors, [])
    assert.equal(result.success, true)

    const shellDir = join(projectDir, 'src-tauri')
    const conf = JSON.parse(
      await readFile(join(shellDir, 'tauri.conf.json'), 'utf-8')
    )
    assert.equal(conf.productName, 'shop')
    assert.equal(conf.identifier, 'com.shop.desktop')
    assert.deepEqual(conf.bundle.externalBin, ['binaries/shop'])

    // The sidecar must be the binary the compile step actually produced, under
    // the triple-suffixed name externalBin resolves.
    const compiled = await readFile(join(outDir, 'shop'))
    const shipped = await readFile(
      join(shellDir, 'binaries', sidecarFileName('shop', result.targetTriple!))
    )
    assert.ok(compiled.equals(shipped))
    assert.notEqual(
      (
        await stat(
          join(
            shellDir,
            'binaries',
            sidecarFileName('shop', result.targetTriple!)
          )
        )
      ).mode & 0o111,
      0
    )
  })

  test('takes an explicit bundle identifier over the derived one', async () => {
    const { buildDir, projectDir } = await builtUnit()

    await new StandaloneProviderAdapter({
      runtime: 'bun',
      desktop: true,
      projectDir,
      desktopIdentifier: 'com.acme.pos',
    }).deploy({ buildDir, logger: silentLogger })

    const conf = JSON.parse(
      await readFile(join(projectDir, 'src-tauri', 'tauri.conf.json'), 'utf-8')
    )
    assert.equal(conf.identifier, 'com.acme.pos')
  })

  test('points a remote shell at the url, with no runtime requirement', async () => {
    const { buildDir, projectDir } = await builtUnit()

    // Nothing is bundled, so there is no binary to compile and no reason to
    // insist on bun — the node runtime has to be allowed through here.
    const result = await new StandaloneProviderAdapter({
      runtime: 'node',
      desktop: true,
      desktopUrl: 'https://shop.example.com',
      projectDir,
    }).deploy({ buildDir, logger: silentLogger })

    assert.deepEqual(result.errors, [])
    assert.equal(result.success, true)

    const shellDir = join(projectDir, 'src-tauri')
    const conf = JSON.parse(
      await readFile(join(shellDir, 'tauri.conf.json'), 'utf-8')
    )
    assert.equal(conf.bundle.externalBin, undefined)
    assert.equal(conf.app.windows[0].url, 'https://shop.example.com')
    await assert.rejects(
      () => stat(join(shellDir, 'binaries')),
      'a remote shell ships no sidecar'
    )
  })

  test('refuses a url that is not http(s)', async () => {
    const { buildDir, projectDir } = await builtUnit()

    const result = await new StandaloneProviderAdapter({
      runtime: 'node',
      desktop: true,
      desktopUrl: 'file:///etc/passwd',
      projectDir,
    }).deploy({ buildDir, logger: silentLogger })

    assert.equal(result.success, false)
    assert.match(result.errors[0]!.error, /http/i)
  })

  test('a plain standalone deploy generates no shell at all', async () => {
    const { buildDir, projectDir } = await builtUnit()

    await new StandaloneProviderAdapter({
      runtime: 'bun',
      projectDir,
    }).deploy({ buildDir, logger: silentLogger })

    await assert.rejects(() => stat(join(projectDir, 'src-tauri')))
  })
})
