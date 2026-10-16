import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  InspectorBinaryNotFoundError,
  SUPPORTED_PLATFORMS,
  executableName,
  findInspectorBinary,
  platformPackageName,
} from './binary.js'
// @ts-ignore -- plain .mjs build script, no declarations
import { PLATFORMS, targetName } from '../scripts/platforms.mjs'
// @ts-ignore -- plain .mjs build script, no declarations
import { binaryProblem } from '../scripts/check-platform-binary.mjs'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

/**
 * A project with `@pikku/inspector-go-<target>` installed in node_modules, and
 * a resolver rooted in it, the way the real `require.resolve` sees an install.
 */
const installProject = (target: string, withBinary = true) => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'pikku-inspector-go-install-'))
  )
  const [platform] = target.split('-')
  const pkgDir = join(root, 'node_modules', '@pikku', `inspector-go-${target}`)
  mkdirSync(join(pkgDir, 'bin'), { recursive: true })
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: `@pikku/inspector-go-${target}`, version: '0.0.0' })
  )
  const binary = join(pkgDir, 'bin', executableName(platform))
  if (withBinary) {
    writeFileSync(binary, '')
    chmodSync(binary, 0o755)
  }
  const resolve = createRequire(join(root, 'index.js')).resolve
  return { root, binary, resolve }
}

const nowhere = join(tmpdir(), 'pikku-inspector-go-no-local-build')

describe('findInspectorBinary', () => {
  test('PIKKU_INSPECTOR_GO_BIN wins over an installed package', () => {
    const { binary, resolve } = installProject('linux-x64')
    const override = join(dirname(binary), 'override')
    writeFileSync(override, '')
    assert.equal(
      findInspectorBinary(
        { PIKKU_INSPECTOR_GO_BIN: override },
        { platform: 'linux', arch: 'x64', resolve }
      ),
      override
    )
  })

  test('PIKKU_INSPECTOR_GO_BIN pointing nowhere is an error, not a fallback', () => {
    assert.throws(
      () =>
        findInspectorBinary({
          PIKKU_INSPECTOR_GO_BIN: '/opt/nope/pikku-inspect',
        }),
      (error: Error) =>
        error instanceof InspectorBinaryNotFoundError &&
        error.message.includes('/opt/nope/pikku-inspect')
    )
  })

  test('resolves the installed platform package', () => {
    const { binary, resolve } = installProject('linux-arm64')
    assert.equal(
      findInspectorBinary(
        {},
        { platform: 'linux', arch: 'arm64', resolve, localBinary: nowhere }
      ),
      binary
    )
  })

  test('looks for pikku-inspect.exe on Windows', () => {
    const { binary, resolve } = installProject('win32-x64')
    assert.ok(binary.endsWith('pikku-inspect.exe'))
    assert.equal(
      findInspectorBinary(
        {},
        { platform: 'win32', arch: 'x64', resolve, localBinary: nowhere }
      ),
      binary
    )
  })

  test('does not pick another platform’s package', () => {
    const { resolve } = installProject('linux-x64')
    assert.throws(
      () =>
        findInspectorBinary(
          {},
          { platform: 'linux', arch: 'arm64', resolve, localBinary: nowhere }
        ),
      InspectorBinaryNotFoundError
    )
  })

  test('falls back to the local build when the package has no binary', () => {
    const { root, resolve } = installProject('darwin-arm64', false)
    const local = join(root, 'pikku-inspect')
    writeFileSync(local, '')
    assert.equal(
      findInspectorBinary(
        {},
        { platform: 'darwin', arch: 'arm64', resolve, localBinary: local }
      ),
      local
    )
  })

  test('names the platform, the package and a fix when nothing matches', () => {
    const { resolve } = installProject('darwin-arm64', false)
    assert.throws(
      () =>
        findInspectorBinary(
          {},
          { platform: 'darwin', arch: 'arm64', resolve, localBinary: nowhere }
        ),
      (error: Error) =>
        error instanceof InspectorBinaryNotFoundError &&
        error.message.includes('for darwin-arm64') &&
        error.message.includes(
          '@pikku/inspector-go-darwin-arm64 is not installed'
        ) &&
        error.message.includes('optional dependencies') &&
        error.message.includes('PIKKU_INSPECTOR_GO_BIN')
    )
  })

  test('says there is no prebuilt binary for an unsupported platform', () => {
    assert.throws(
      () =>
        findInspectorBinary(
          {},
          { platform: 'freebsd', arch: 'x64', localBinary: nowhere }
        ),
      (error: Error) =>
        error.message.includes('for freebsd-x64') &&
        error.message.includes('no prebuilt binary') &&
        error.message.includes('darwin-arm64, darwin-x64')
    )
  })

  test('names the per-platform package esbuild style', () => {
    assert.equal(
      platformPackageName('darwin', 'arm64'),
      '@pikku/inspector-go-darwin-arm64'
    )
  })
})

describe('platform packages', () => {
  const pkg = readJson(join(PKG_DIR, 'package.json'))
  const targets: string[] = PLATFORMS.map(targetName)

  test('binary.ts, scripts/platforms.mjs and npm/ list the same targets', () => {
    assert.deepEqual([...SUPPORTED_PLATFORMS].sort(), [...targets].sort())
    assert.deepEqual(
      readdirSync(join(PKG_DIR, 'npm')).sort(),
      [...targets].sort()
    )
  })

  test('each is an exact optional dependency in lockstep with this package', () => {
    assert.deepEqual(
      pkg.optionalDependencies,
      Object.fromEntries(
        targets
          .sort()
          .map((t) => [platformPackageName(...split(t)), pkg.version])
      )
    )
  })

  for (const { platform, arch } of PLATFORMS) {
    test(`npm/${platform}-${arch} declares its os, cpu and binary`, () => {
      const dir = join(PKG_DIR, 'npm', `${platform}-${arch}`)
      const platformPkg = readJson(join(dir, 'package.json'))
      assert.equal(platformPkg.name, platformPackageName(platform, arch))
      assert.equal(platformPkg.version, pkg.version)
      assert.equal(platformPkg.license, pkg.license)
      assert.deepEqual(platformPkg.os, [platform])
      assert.deepEqual(platformPkg.cpu, [arch])
      assert.deepEqual(platformPkg.files, ['bin', 'LICENSE'])
      assert.match(platformPkg.scripts.prepublishOnly, /check-platform-binary/)
      assert.equal(
        platformPkg.repository.directory,
        `packages/inspector-go/npm/${platform}-${arch}`
      )
    })
  }
})

const split = (target: string): [string, string] => {
  const [platform, arch] = target.split('-')
  return [platform!, arch!]
}

describe('binaryProblem', () => {
  const MB = 1024 * 1024

  const elf = (machine: number, interp: boolean) => {
    const buf = Buffer.alloc(2 * MB)
    buf.writeUInt32BE(0x7f454c46, 0)
    buf[4] = 2
    buf.writeUInt16LE(machine, 18)
    buf.writeBigUInt64LE(64n, 32)
    buf.writeUInt16LE(56, 54)
    buf.writeUInt16LE(2, 56)
    buf.writeUInt32LE(1, 64) // PT_LOAD
    buf.writeUInt32LE(interp ? 3 : 1, 64 + 56)
    return buf
  }

  const pe = (machine: number) => {
    const buf = Buffer.alloc(2 * MB)
    buf.write('MZ', 0, 'latin1')
    buf.writeUInt32LE(0x80, 0x3c)
    buf.write('PE\0\0', 0x80, 'latin1')
    buf.writeUInt16LE(machine, 0x84)
    return buf
  }

  const macho = (cpu: number) => {
    const buf = Buffer.alloc(2 * MB)
    buf.writeUInt32LE(0xfeedfacf, 0)
    buf.writeUInt32LE(cpu, 4)
    return buf
  }

  test('accepts a static ELF, a PE and a Mach-O for the right arch', () => {
    assert.equal(binaryProblem(elf(62, false), 'linux', 'x64'), undefined)
    assert.equal(binaryProblem(elf(183, false), 'linux', 'arm64'), undefined)
    assert.equal(binaryProblem(pe(0x8664), 'win32', 'x64'), undefined)
    assert.equal(binaryProblem(macho(0x0100000c), 'darwin', 'arm64'), undefined)
    assert.equal(binaryProblem(macho(0x01000007), 'darwin', 'x64'), undefined)
  })

  test('rejects a dynamically linked ELF', () => {
    assert.match(
      binaryProblem(elf(62, true), 'linux', 'x64'),
      /dynamically linked/
    )
  })

  test('rejects the wrong arch or format', () => {
    assert.match(binaryProblem(elf(183, false), 'linux', 'x64'), /e_machine/)
    assert.match(binaryProblem(macho(0x01000007), 'darwin', 'arm64'), /cputype/)
    assert.match(binaryProblem(elf(62, false), 'win32', 'x64'), /not a PE/)
  })

  test('rejects an empty or truncated file', () => {
    assert.match(binaryProblem(Buffer.alloc(0), 'linux', 'x64'), /0 bytes/)
  })
})
