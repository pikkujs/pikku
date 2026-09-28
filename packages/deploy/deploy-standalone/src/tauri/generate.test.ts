import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SERVER_READY_MARKER } from '@pikku/deploy'

import { DATA_DIR_ENV, PARENT_PID_ENV } from '../runtime/parent-watch.js'
import { generateTauriShell, tauriBundleIdentifier } from './generate.js'
import { sidecarFileName } from './target-triple.js'

const TRIPLE = 'aarch64-apple-darwin'

const scratch = async () => mkdtemp(join(tmpdir(), 'pikku-tauri-'))

const withBinary = async (dir: string) => {
  const path = join(dir, 'shop')
  await writeFile(path, 'not really a binary', 'utf-8')
  return path
}

const generate = async (
  projectDir: string,
  overrides: Partial<Parameters<typeof generateTauriShell>[0]> = {}
) =>
  generateTauriShell({
    projectDir,
    appName: 'shop',
    identifier: 'com.acme.shop',
    targetTriple: TRIPLE,
    ...overrides,
  })

describe('the bundle identifier a shell is published under', () => {
  it('reads an org out of a scoped package name', () => {
    assert.equal(tauriBundleIdentifier('@acme/shop'), 'com.acme.shop')
  })

  it('gives an unscoped package a valid identifier of its own', () => {
    const id = tauriBundleIdentifier('shop')
    assert.equal(id, 'com.shop.desktop')
    assert.ok(
      !id.endsWith('.app'),
      'Tauri rejects an identifier ending in .app on macOS'
    )
  })

  it('strips characters an identifier segment cannot hold', () => {
    assert.equal(
      tauriBundleIdentifier('@Acme Corp/My_Shop!'),
      'com.acme-corp.my-shop'
    )
  })
})

describe('generating a Tauri shell around a pikku binary', () => {
  it('writes a crate a Rust toolchain could build', async () => {
    const dir = await scratch()
    try {
      const result = await generate(dir)
      for (const expected of [
        'tauri.conf.json',
        'Cargo.toml',
        'build.rs',
        'src/main.rs',
        'src/lib.rs',
        'icons/icon.png',
        '.gitignore',
      ]) {
        assert.ok(
          result.written.includes(expected),
          `${expected} was not generated (got ${result.written.join(', ')})`
        )
        await stat(join(dir, 'src-tauri', expected))
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('takes the product name and identifier from the project', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      const conf = JSON.parse(
        await readFile(join(dir, 'src-tauri', 'tauri.conf.json'), 'utf-8')
      )
      assert.equal(conf.productName, 'shop')
      assert.equal(conf.identifier, 'com.acme.shop')
      assert.deepEqual(conf.bundle.externalBin, ['binaries/shop'])
      assert.deepEqual(
        conf.app.windows,
        [],
        'the window is created from Rust once the port is known'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('emits lib.rs wired to the decisions this shell rests on', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      const main = await readFile(
        join(dir, 'src-tauri', 'src', 'lib.rs'),
        'utf-8'
      )

      assert.match(
        main,
        /tauri_plugin_single_instance/,
        'two shells would mean two SQLite writers'
      )
      assert.match(main, /app_data_dir/)
      assert.match(main, new RegExp(DATA_DIR_ENV))
      assert.match(main, new RegExp(PARENT_PID_ENV))
      assert.match(main, /\.env\("PORT", "0"\)/)
      assert.ok(
        main.includes(SERVER_READY_MARKER),
        'the shell blocks on the ready line to learn the port'
      )
      assert.match(main, /127\.0\.0\.1/)
      assert.match(main, /sidecar\("shop"\)/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('gives up when the sidecar never becomes ready', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      const main = await readFile(
        join(dir, 'src-tauri', 'src', 'lib.rs'),
        'utf-8'
      )

      // A sidecar that starts and then hangs prints no ready line, so nothing
      // opens a window — and a Tauri process with no window cannot be quit
      // from the dock. The shell has to notice and exit on its own.
      assert.match(main, /READY_TIMEOUT/)
      assert.match(main, /did not become ready/)
      assert.match(main, /exit\(1\)/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('never asks the shell to choose a port', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      const main = await readFile(
        join(dir, 'src-tauri', 'src', 'lib.rs'),
        'utf-8'
      )
      assert.doesNotMatch(
        main,
        /TcpListener::bind|portpicker|free_port/,
        'picking a port in the parent races whatever binds it next'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('lands the binary under the name externalBin resolves', async () => {
    const dir = await scratch()
    try {
      const binaryPath = await withBinary(dir)
      const result = await generate(dir, { binaryPath })

      const expected = sidecarFileName('shop', TRIPLE)
      assert.equal(result.sidecar?.fileName, expected)
      const landed = join(dir, 'src-tauri', 'binaries', expected)
      assert.equal(await readFile(landed, 'utf-8'), 'not really a binary')
      const mode = (await stat(landed)).mode & 0o111
      assert.notEqual(mode, 0, 'a sidecar Tauri cannot execute is useless')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps build output out of git', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      const ignore = await readFile(
        join(dir, 'src-tauri', '.gitignore'),
        'utf-8'
      )
      assert.match(ignore, /^\/target$/m)
      assert.match(ignore, /^\/binaries$/m)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('is idempotent — a second run changes nothing', async () => {
    const dir = await scratch()
    try {
      const binaryPath = await withBinary(dir)
      await generate(dir, { binaryPath })
      const before = await readFile(
        join(dir, 'src-tauri', 'src', 'main.rs'),
        'utf-8'
      )

      const second = await generate(dir, { binaryPath })
      assert.deepEqual(
        second.written,
        [],
        `nothing should be rewritten, got ${second.written.join(', ')}`
      )
      assert.deepEqual(second.preserved, [])
      assert.equal(
        await readFile(join(dir, 'src-tauri', 'src', 'main.rs'), 'utf-8'),
        before
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses to clobber a main.rs the user has edited, and says so', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      const mainPath = join(dir, 'src-tauri', 'src', 'main.rs')
      const edited = '// my own shell\nfn main() {}\n'
      await writeFile(mainPath, edited, 'utf-8')

      const second = await generate(dir)
      assert.ok(
        second.preserved.includes('src/main.rs'),
        'an untouched report would hide the fact that the edit was kept'
      )
      assert.ok(!second.written.includes('src/main.rs'))
      assert.equal(await readFile(mainPath, 'utf-8'), edited)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('leaves a pre-existing src-tauri it did not generate alone', async () => {
    const dir = await scratch()
    try {
      await mkdir(join(dir, 'src-tauri', 'src'), { recursive: true })
      const mainPath = join(dir, 'src-tauri', 'src', 'main.rs')
      await writeFile(mainPath, 'fn main() { /* hand written */ }', 'utf-8')

      const result = await generate(dir)
      assert.ok(result.preserved.includes('src/main.rs'))
      assert.equal(
        await readFile(mainPath, 'utf-8'),
        'fn main() { /* hand written */ }'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('updates a generated file the user never touched', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      const result = await generate(dir, { windowTitle: 'Shop Desktop' })
      assert.ok(
        result.written.includes('src/lib.rs'),
        'a template change must reach a file nobody has claimed'
      )
      const main = await readFile(
        join(dir, 'src-tauri', 'src', 'lib.rs'),
        'utf-8'
      )
      assert.match(main, /Shop Desktop/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects an app name that is not a usable crate or file name', async () => {
    const dir = await scratch()
    try {
      await assert.rejects(() => generate(dir, { appName: '../evil' }), /name/i)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('fails loudly when the binary it was pointed at is missing', async () => {
    const dir = await scratch()
    try {
      await assert.rejects(
        () => generate(dir, { binaryPath: join(dir, 'nope') }),
        /nope/
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('generating a Tauri shell that points at a remote pikku server', () => {
  const remote = async (
    projectDir: string,
    overrides: Partial<Parameters<typeof generateTauriShell>[0]> = {}
  ) =>
    generate(projectDir, {
      remoteUrl: 'https://shop.example.com',
      ...overrides,
    })

  it('declares the window in the config, because the url is already known', async () => {
    const dir = await scratch()
    try {
      await remote(dir)
      const conf = JSON.parse(
        await readFile(join(dir, 'src-tauri', 'tauri.conf.json'), 'utf-8')
      )
      assert.equal(conf.app.windows[0].url, 'https://shop.example.com')
      assert.equal(conf.app.windows[0].label, 'main')
      assert.equal(
        conf.bundle.externalBin,
        undefined,
        'there is no sidecar to declare'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('leaves the sidecar machinery out of lib.rs entirely', async () => {
    const dir = await scratch()
    try {
      await remote(dir)
      const main = await readFile(
        join(dir, 'src-tauri', 'src', 'lib.rs'),
        'utf-8'
      )

      assert.match(
        main,
        /tauri_plugin_single_instance/,
        'a second window on the same remote session is still not wanted'
      )
      assert.doesNotMatch(main, /sidecar|CommandChild/)
      assert.ok(!main.includes(SERVER_READY_MARKER))
      assert.doesNotMatch(main, new RegExp(DATA_DIR_ENV))
      assert.doesNotMatch(main, new RegExp(PARENT_PID_ENV))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('drops the shell plugin it no longer has a process to run', async () => {
    const dir = await scratch()
    try {
      await remote(dir)
      const cargo = await readFile(
        join(dir, 'src-tauri', 'Cargo.toml'),
        'utf-8'
      )
      assert.doesNotMatch(cargo, /tauri-plugin-shell/)
      assert.match(cargo, /tauri-plugin-single-instance/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses a binary it has nothing to run with', async () => {
    const dir = await scratch()
    try {
      const binaryPath = await withBinary(dir)
      await assert.rejects(
        () => remote(dir, { binaryPath }),
        /remote/i,
        'shipping a sidecar nothing starts would be a silent lie'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects a url the webview could not open', async () => {
    const dir = await scratch()
    try {
      await assert.rejects(
        () => generate(dir, { remoteUrl: 'file:///etc/passwd' }),
        /http/i
      )
      await assert.rejects(
        () => generate(dir, { remoteUrl: 'not a url' }),
        /url/i
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

const readShell = (dir: string, path: string) =>
  readFile(join(dir, 'src-tauri', path), 'utf-8')

const DESKTOP_DEPS = `[target.'cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))'.dependencies]`
const MOBILE_DEPS = `[target.'cfg(any(target_os = "android", target_os = "ios"))'.dependencies]`

describe('a shell that can be built for a phone', () => {
  it('declares a library target, which is what a mobile build links', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      const cargo = await readShell(dir, 'Cargo.toml')
      assert.match(cargo, /^\[lib\]\nname = "shop_shell_lib"$/m)
      assert.match(
        cargo,
        /^crate-type = \["staticlib", "cdylib", "rlib"\]$/m,
        'Android loads a cdylib and iOS links a staticlib'
      )
      assert.match(
        await readShell(dir, 'src/main.rs'),
        /shop_shell_lib::run\(\)/,
        'main.rs is only the desktop entry point into the library'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('gates single-instance to desktop, in Cargo.toml and in lib.rs', async () => {
    const dir = await scratch()
    try {
      await generate(dir, { remoteUrl: 'https://shop.example.com' })
      const cargo = await readShell(dir, 'Cargo.toml')
      const [plainDeps, desktopDeps] = cargo.split(DESKTOP_DEPS)
      assert.ok(desktopDeps, cargo)
      assert.match(desktopDeps!, /^tauri-plugin-single-instance = "2"$/m)
      assert.doesNotMatch(plainDeps!, /single-instance/)

      const lib = await readShell(dir, 'src/lib.rs')
      assert.match(
        lib,
        /#\[cfg\(desktop\)\]\n\s+let builder = builder\.plugin\(tauri_plugin_single_instance::init/
      )
      assert.match(lib, /#\[cfg_attr\(mobile, tauri::mobile_entry_point\)\]/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('makes the sidecar shell refuse a mobile build with a reason', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      assert.match(
        await readShell(dir, 'src/lib.rs'),
        /#\[cfg\(mobile\)\]\ncompile_error!\(\n\s+"[^"]*--desktop-url/
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('native APIs in the shell', () => {
  const remoteUrl = 'https://shop.example.com/app'

  it('puts mobile-only crates under a mobile target, portable ones in plain deps', async () => {
    const dir = await scratch()
    try {
      await generate(dir, {
        remoteUrl,
        native: 'haptics, geolocation,biometric',
      })
      const cargo = await readShell(dir, 'Cargo.toml')
      const [plainDeps] = cargo.split('[target.')
      assert.match(plainDeps!, /^tauri-plugin-geolocation = "2"$/m)
      assert.doesNotMatch(plainDeps!, /biometric|haptics/)

      const [, mobileDeps] = cargo.split(MOBILE_DEPS)
      assert.ok(mobileDeps, cargo)
      assert.match(
        mobileDeps!,
        /^tauri-plugin-biometric = "2"\ntauri-plugin-haptics = "2"$/m,
        'catalogue order, whatever order the flag listed them in'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('initialises every chosen plugin, mobile-only ones behind cfg(mobile)', async () => {
    const dir = await scratch()
    try {
      await generate(dir, { remoteUrl, native: ['biometric', 'geolocation'] })
      const lib = await readShell(dir, 'src/lib.rs')
      assert.match(
        lib,
        /#\[cfg\(mobile\)\]\n\s+let builder = builder\.plugin\(tauri_plugin_biometric::init\(\)\);/
      )
      assert.match(
        lib,
        /\);\n\s+let builder = builder\.plugin\(tauri_plugin_geolocation::init\(\)\);/,
        'a plugin with a desktop build is not gated'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('grants the permissions to the remote origin, split by platform', async () => {
    const dir = await scratch()
    try {
      const result = await generate(dir, {
        remoteUrl,
        native: ['biometric', 'geolocation'],
      })
      assert.deepEqual(
        result.native.map((api) => api.name),
        ['biometric', 'geolocation']
      )
      const desktop = JSON.parse(
        await readShell(dir, 'capabilities/remote.json')
      )
      assert.deepEqual(desktop.remote.urls, ['https://shop.example.com'])
      assert.deepEqual(desktop.permissions, [
        'core:default',
        'geolocation:default',
      ])
      const mobile = JSON.parse(
        await readShell(dir, 'capabilities/remote-mobile.json')
      )
      assert.deepEqual(mobile.platforms, ['iOS', 'android'])
      assert.deepEqual(mobile.permissions, ['biometric:default'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('writes the iOS consent strings the chosen APIs need', async () => {
    const dir = await scratch()
    try {
      await generate(dir, { remoteUrl, native: ['biometric', 'geolocation'] })
      const plist = await readShell(dir, 'Info.ios.plist')
      assert.match(plist, /<key>NSFaceIDUsageDescription<\/key>/)
      assert.match(plist, /<key>NSLocationWhenInUseUsageDescription<\/key>/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('writes no grant, no plist and no extra crate when none are asked for', async () => {
    const dir = await scratch()
    try {
      const result = await generate(dir, { remoteUrl })
      assert.deepEqual(result.native, [])
      assert.ok(!result.written.includes('capabilities/remote.json'))
      assert.ok(!result.written.includes('Info.ios.plist'))
      assert.ok(
        !(await readShell(dir, 'Cargo.toml')).includes(MOBILE_DEPS),
        'no mobile dependency section without a mobile-only plugin'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('initialises portable plugins in a sidecar shell, granted to loopback', async () => {
    const dir = await scratch()
    try {
      await generate(dir, { native: 'dialog' })
      assert.match(
        await readShell(dir, 'src/lib.rs'),
        /\.plugin\(tauri_plugin_shell::init\(\)\)\n\s+\.plugin\(tauri_plugin_dialog::init\(\)\)/
      )
      const grant = JSON.parse(await readShell(dir, 'capabilities/remote.json'))
      assert.deepEqual(grant.remote.urls, ['http://127.0.0.1:*'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses a mobile-only API on a shell that can only run on a desktop', async () => {
    const dir = await scratch()
    try {
      await assert.rejects(
        () => generate(dir, { native: 'biometric' }),
        /biometric exists only on iOS and Android/
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses an API it does not know, and lists the ones it does', async () => {
    const dir = await scratch()
    try {
      await assert.rejects(
        () => generate(dir, { remoteUrl, native: 'camera,haptics' }),
        /Unknown native api "camera"\. Available: biometric, haptics/
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
