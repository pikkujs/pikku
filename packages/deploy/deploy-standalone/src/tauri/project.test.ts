import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  checkNativeProject,
  createNativeProject,
  nativePackageJson,
  syncNativeProject,
  type NativeProjectSpec,
} from './project.js'

const tempDirs: string[] = []
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

const newSpec = async (
  overrides: Partial<NativeProjectSpec> = {}
): Promise<NativeProjectSpec> => {
  const cwd = await mkdtemp(join(tmpdir(), 'pikku-native-'))
  tempDirs.push(cwd)
  return {
    dir: join(cwd, 'src-tauri'),
    name: 'customer',
    identifier: 'com.acme.customer',
    productName: 'Acme',
    platforms: ['desktop', 'android'],
    plugins: [],
    mode: { kind: 'bundle', frontendDist: '../dist' },
    ...overrides,
  }
}

const read = (spec: NativeProjectSpec, path: string) =>
  readFile(join(spec.dir, path), 'utf-8')
const readJson = async (spec: NativeProjectSpec, path: string) =>
  JSON.parse(await read(spec, path))

describe('createNativeProject', () => {
  it('bundles the frontend dist and declares its window', async () => {
    const spec = await newSpec({ devUrl: 'http://localhost:5173' })
    await createNativeProject(spec)

    const conf = await readJson(spec, 'tauri.conf.json')
    assert.equal(conf.identifier, 'com.acme.customer')
    assert.equal(conf.productName, 'Acme')
    assert.equal(conf.build.frontendDist, '../dist')
    assert.equal(conf.build.devUrl, 'http://localhost:5173')
    assert.equal(conf.app.windows[0].label, 'main')
    assert.equal(conf.bundle.externalBin, undefined)

    const capability = await readJson(spec, 'capabilities/pikku.json')
    assert.equal(
      capability.remote,
      undefined,
      'a bundled UI is the app’s own origin and needs no remote grant'
    )
  })

  it('initialises plugins in pikku.rs, which lib.rs calls', async () => {
    const spec = await newSpec({ plugins: ['store', 'biometric'] })
    await createNativeProject(spec)

    const pikkuRs = await read(spec, 'src/pikku.rs')
    assert.match(pikkuRs, /tauri_plugin_store::Builder::new\(\)\.build\(\)/)
    assert.match(
      pikkuRs,
      /#\[cfg\(mobile\)\]\n\s+let builder = builder\.plugin\(tauri_plugin_biometric::init\(\)\);/
    )
    const lib = await read(spec, 'src/lib.rs')
    assert.match(lib, /mod pikku;/)
    assert.match(lib, /pikku::plugins\(builder\)/)

    const cargo = await read(spec, 'Cargo.toml')
    assert.match(
      cargo,
      /# pikku:plugins:start\ntauri-plugin-store = "2"\n# pikku:plugins:end/
    )
    assert.match(
      cargo,
      /# pikku:mobile-plugins:start\ntauri-plugin-biometric = "2"\n# pikku:mobile-plugins:end/
    )
    assert.deepEqual(
      (await readJson(spec, 'capabilities/pikku-mobile.json')).permissions,
      ['biometric:default']
    )
  })

  it('points url mode at the origin and grants it the plugins', async () => {
    const spec = await newSpec({
      mode: { kind: 'url', url: 'https://shop.example.com/app' },
      plugins: ['dialog'],
    })
    await createNativeProject(spec)

    const conf = await readJson(spec, 'tauri.conf.json')
    assert.equal(conf.build.frontendDist, 'https://shop.example.com/app')
    const capability = await readJson(spec, 'capabilities/pikku.json')
    assert.deepEqual(capability.remote.urls, ['https://shop.example.com'])
    assert.deepEqual(capability.permissions, ['core:default', 'dialog:default'])
  })

  it('gives a bundled server a sidecar, a placeholder page and no declared window', async () => {
    const spec = await newSpec({
      mode: { kind: 'sidecar' },
      platforms: ['desktop'],
    })
    await createNativeProject(spec)

    const conf = await readJson(spec, 'tauri.conf.json')
    assert.deepEqual(conf.bundle.externalBin, ['binaries/pikku-server'])
    assert.equal(conf.build.frontendDist, 'ui')
    assert.deepEqual(conf.app.windows, [])
    assert.match(await read(spec, 'src/lib.rs'), /\.sidecar\("pikku-server"\)/)
    assert.match(await read(spec, 'src/pikku.rs'), /tauri_plugin_shell::init/)
    await stat(join(spec.dir, 'ui/index.html'))
  })

  it('writes the iOS consent strings a plugin needs', async () => {
    const spec = await newSpec({ plugins: ['biometric'] })
    await createNativeProject(spec)
    assert.match(
      await read(spec, 'Info.ios.plist'),
      /<key>NSFaceIDUsageDescription<\/key>/
    )
  })

  it('refuses a bundled server on a phone', async () => {
    const spec = await newSpec({
      mode: { kind: 'sidecar' },
      platforms: ['desktop', 'android'],
    })
    await assert.rejects(() => createNativeProject(spec), /android/)
  })

  it('refuses an identifier Android would refuse', async () => {
    const spec = await newSpec({ identifier: 'com.acme.my-shop' })
    await assert.rejects(() => createNativeProject(spec), /hyphens/)
  })

  it('refuses a url that is not http(s)', async () => {
    const spec = await newSpec({ mode: { kind: 'url', url: 'file:///etc' } })
    await assert.rejects(() => createNativeProject(spec), /http/)
  })

  it('refuses an unknown plugin', async () => {
    const spec = await newSpec({ plugins: ['teleport'] })
    await assert.rejects(() => createNativeProject(spec), /teleport/)
  })

  it('refuses to overwrite an existing project', async () => {
    const spec = await newSpec()
    await createNativeProject(spec)
    await assert.rejects(() => createNativeProject(spec), /upgrade customer/)
  })
})

describe('syncNativeProject', () => {
  it('adds a plugin without touching what the user wrote', async () => {
    const spec = await newSpec()
    await createNativeProject(spec)

    const lib = (await read(spec, 'src/lib.rs')) + '\n// my edit\n'
    await writeFile(join(spec.dir, 'src/lib.rs'), lib)
    const cargo = (await read(spec, 'Cargo.toml')).replace(
      '[dependencies]\n',
      '[dependencies]\nserde = "1"\n'
    )
    await writeFile(join(spec.dir, 'Cargo.toml'), cargo)
    const conf = await readJson(spec, 'tauri.conf.json')
    conf.app.windows[0].width = 400
    await writeFile(join(spec.dir, 'tauri.conf.json'), JSON.stringify(conf))

    const { written } = await syncNativeProject({
      ...spec,
      plugins: ['store', 'haptics'],
    })

    assert.deepEqual(written.sort(), [
      'Cargo.toml',
      'capabilities/pikku-mobile.json',
      'capabilities/pikku.json',
      'src/pikku.rs',
      'tauri.conf.json',
    ])
    assert.equal(await read(spec, 'src/lib.rs'), lib)
    const synced = await read(spec, 'Cargo.toml')
    assert.match(synced, /serde = "1"/)
    assert.match(synced, /tauri-plugin-store = "2"/)
    assert.match(synced, /tauri-plugin-haptics = "2"/)
    assert.equal(
      (await readJson(spec, 'tauri.conf.json')).app.windows[0].width,
      400
    )
    assert.match(await read(spec, 'src/pikku.rs'), /tauri_plugin_haptics/)
  })

  it('removes the mobile capability with its last plugin', async () => {
    const spec = await newSpec({ plugins: ['haptics'] })
    await createNativeProject(spec)
    await syncNativeProject({ ...spec, plugins: [] })
    await assert.rejects(() =>
      stat(join(spec.dir, 'capabilities/pikku-mobile.json'))
    )
  })

  it('writes nothing when already in sync', async () => {
    const spec = await newSpec({ plugins: ['store'] })
    await createNativeProject(spec)
    assert.deepEqual((await syncNativeProject(spec)).written, [])
  })

  it('refuses a Cargo.toml whose markers were deleted', async () => {
    const spec = await newSpec()
    await createNativeProject(spec)
    const cargo = (await read(spec, 'Cargo.toml')).replace(
      '# pikku:plugins:start\n',
      ''
    )
    await writeFile(join(spec.dir, 'Cargo.toml'), cargo)
    await assert.rejects(() => syncNativeProject(spec), /markers/)
  })

  it('re-applies a changed identifier', async () => {
    const spec = await newSpec()
    await createNativeProject(spec)
    await syncNativeProject({ ...spec, identifier: 'com.acme.shopper' })
    assert.equal(
      (await readJson(spec, 'tauri.conf.json')).identifier,
      'com.acme.shopper'
    )
  })
})

describe('checkNativeProject', () => {
  it('passes a freshly created project', async () => {
    const spec = await newSpec({
      plugins: ['store', 'biometric'],
      platforms: ['desktop', 'android', 'ios'],
    })
    await createNativeProject(spec)
    assert.deepEqual(await checkNativeProject(spec), [])
  })

  it('reports a plugin added to the config as one upgrade away', async () => {
    const spec = await newSpec()
    await createNativeProject(spec)
    const problems = await checkNativeProject({ ...spec, plugins: ['store'] })
    assert.ok(problems.length > 0)
    assert.ok(problems.every((p) => p.fix === 'upgrade'))
  })

  it('reports a lib.rs that stopped calling pikku::plugins', async () => {
    const spec = await newSpec()
    await createNativeProject(spec)
    await writeFile(join(spec.dir, 'src/lib.rs'), 'pub fn run() {}\n')
    const problems = await checkNativeProject(spec)
    assert.match(problems[0]!.message, /pikku::plugins/)
    assert.notEqual(problems[0]!.fix, 'upgrade')
  })

  it('reports an iOS consent string the user deleted', async () => {
    const spec = await newSpec({
      plugins: ['barcode-scanner'],
      platforms: ['ios'],
    })
    await createNativeProject(spec)
    await writeFile(join(spec.dir, 'Info.ios.plist'), '<plist/>')
    const problems = await checkNativeProject(spec)
    assert.match(problems[0]!.message, /NSCameraUsageDescription/)
  })

  it('reports an Android project generated for another identifier', async () => {
    const spec = await newSpec()
    await createNativeProject(spec)
    await mkdir(join(spec.dir, 'gen/android/app'), { recursive: true })
    await writeFile(
      join(spec.dir, 'gen/android/app/build.gradle.kts'),
      'android {\n  defaultConfig {\n    applicationId = "com.acme.old"\n  }\n}\n'
    )
    const problems = await checkNativeProject(spec)
    assert.match(problems[0]!.message, /com\.acme\.old/)
    assert.match(problems[0]!.fix, /tauri android init/)
  })

  it('warns, and only warns, about an unbuilt frontend', async () => {
    const spec = await newSpec()
    await createNativeProject(spec)
    const problems = await checkNativeProject(spec, {
      distDir: join(spec.dir, '../dist'),
    })
    assert.deepEqual(
      problems.map((p) => p.level),
      ['warning']
    )
  })

  it('points at init when there is no project yet', async () => {
    const spec = await newSpec()
    const problems = await checkNativeProject(spec)
    assert.equal(problems[0]!.fix, 'pikku app native init customer')
  })
})

describe('nativePackageJson', () => {
  it('adds the CLI, the API and one package per plugin', () => {
    assert.deepEqual(nativePackageJson(['store', 'barcode-scanner']), {
      dependencies: {
        '@tauri-apps/api': '^2',
        '@tauri-apps/plugin-barcode-scanner': '^2',
        '@tauri-apps/plugin-store': '^2',
      },
      devDependencies: { '@tauri-apps/cli': '^2' },
      scripts: { tauri: 'tauri' },
    })
  })
})
