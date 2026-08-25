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

  it('emits main.rs wired to the decisions this shell rests on', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      const main = await readFile(
        join(dir, 'src-tauri', 'src', 'main.rs'),
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
        join(dir, 'src-tauri', 'src', 'main.rs'),
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
        join(dir, 'src-tauri', 'src', 'main.rs'),
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

  it('holds no passphrase of any kind', async () => {
    const dir = await scratch()
    try {
      await generate(dir)
      const main = await readFile(
        join(dir, 'src-tauri', 'src', 'main.rs'),
        'utf-8'
      )
      // Comments are free to explain the design; it is the code that must not
      // touch a key.
      const code = main
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n')
      assert.doesNotMatch(
        code,
        /passphrase|password|PIKKU_PASS|unlock/i,
        'unlocking is an HTTP call the frontend makes; Rust must never see the key'
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
        result.written.includes('src/main.rs'),
        'a template change must reach a file nobody has claimed'
      )
      const main = await readFile(
        join(dir, 'src-tauri', 'src', 'main.rs'),
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
