import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_ENGINE,
  ENGINES,
  INSPECTOR_ENGINES,
  InspectorBinaryNotFoundError,
  SUPPORTED_PLATFORMS,
  configureInspectorEngine,
  executableName,
  findInspectorBinary as findAnyInspectorBinary,
  resolveInspectorEngine,
  type FindInspectorBinaryOptions,
  type InspectorEngine,
} from './binary.js'
// @ts-ignore -- plain .mjs build script, no declarations
import { PLATFORMS, RS_PLATFORMS, targetName } from '../scripts/platforms.mjs'
// @ts-ignore -- plain .mjs build script, no declarations
import { binaryProblem } from '../scripts/check-platform-binary.mjs'

/** The Go engine, whatever DEFAULT_ENGINE is: these tests are about its lookup. */
const findInspectorBinary = (
  env: NodeJS.ProcessEnv,
  options: FindInspectorBinaryOptions = {}
) => findAnyInspectorBinary(env, { engine: 'go', ...options })

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

/** A `prebuilt/` directory holding a binary for each of `targets`. */
const prebuiltDir = (...targets: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-inspector-go-prebuilt-'))
  const binaries: Record<string, string> = {}
  for (const target of targets) {
    const [platform] = target.split('-')
    mkdirSync(join(dir, target))
    const binary = join(dir, target, executableName(platform))
    writeFileSync(binary, '')
    chmodSync(binary, 0o755)
    binaries[target] = binary
  }
  return { dir, binaries }
}

const nowhere = join(tmpdir(), 'pikku-inspector-go-no-local-build')

describe('findInspectorBinary', () => {
  test('PIKKU_INSPECTOR_GO_BIN wins over a prebuilt binary', () => {
    const { dir } = prebuiltDir('linux-x64')
    const override = join(dir, 'override')
    writeFileSync(override, '')
    assert.equal(
      findInspectorBinary(
        { PIKKU_INSPECTOR_GO_BIN: override },
        { platform: 'linux', arch: 'x64', prebuiltDir: dir }
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

  test('picks the prebuilt binary for the platform out of all of them', () => {
    const { dir, binaries } = prebuiltDir(...SUPPORTED_PLATFORMS)
    for (const target of SUPPORTED_PLATFORMS) {
      const [platform, arch] = target.split('-')
      assert.equal(
        findInspectorBinary(
          {},
          { platform, arch, prebuiltDir: dir, localBinary: nowhere }
        ),
        binaries[target]
      )
    }
  })

  test('looks for pikku-inspect.exe on Windows', () => {
    const { dir, binaries } = prebuiltDir('win32-x64')
    assert.ok(binaries['win32-x64']!.endsWith('pikku-inspect.exe'))
    assert.equal(
      findInspectorBinary(
        {},
        {
          platform: 'win32',
          arch: 'x64',
          prebuiltDir: dir,
          localBinary: nowhere,
        }
      ),
      binaries['win32-x64']
    )
  })

  test('does not pick another platform’s binary', () => {
    const { dir } = prebuiltDir('linux-x64')
    assert.throws(
      () =>
        findInspectorBinary(
          {},
          {
            platform: 'linux',
            arch: 'arm64',
            prebuiltDir: dir,
            localBinary: nowhere,
          }
        ),
      InspectorBinaryNotFoundError
    )
  })

  test(
    'restores an executable bit the install dropped',
    {
      skip: process.platform === 'win32',
    },
    () => {
      const { dir, binaries } = prebuiltDir('linux-x64')
      chmodSync(binaries['linux-x64']!, 0o644)
      findInspectorBinary(
        {},
        {
          platform: 'linux',
          arch: 'x64',
          prebuiltDir: dir,
          localBinary: nowhere,
        }
      )
      assert.equal(statSync(binaries['linux-x64']!).mode & 0o111, 0o111)
    }
  )

  test('falls back to the local build when there is no prebuilt binary', () => {
    const { dir } = prebuiltDir()
    const local = join(dir, 'pikku-inspect')
    writeFileSync(local, '')
    assert.equal(
      findInspectorBinary(
        {},
        {
          platform: 'darwin',
          arch: 'arm64',
          prebuiltDir: dir,
          localBinary: local,
        }
      ),
      local
    )
  })

  test('finds pikku-inspect beside a compiled CLI', () => {
    const { dir } = prebuiltDir()
    const beside = join(dir, 'pikku-inspect')
    writeFileSync(beside, '')
    assert.equal(
      findInspectorBinary(
        {},
        {
          platform: 'darwin',
          arch: 'arm64',
          prebuiltDir: join(dir, 'none'),
          localBinary: nowhere,
          execPath: join(dir, 'pikku'),
        }
      ),
      beside
    )
  })

  test('prefers the prebuilt binary to one beside the executable', () => {
    const { dir, binaries } = prebuiltDir('darwin-arm64')
    writeFileSync(join(dir, 'pikku-inspect'), '')
    assert.equal(
      findInspectorBinary(
        {},
        {
          platform: 'darwin',
          arch: 'arm64',
          prebuiltDir: dir,
          localBinary: nowhere,
          execPath: join(dir, 'pikku'),
        }
      ),
      binaries['darwin-arm64']
    )
  })

  test('names the platform and a fix when nothing matches', () => {
    const { dir } = prebuiltDir()
    assert.throws(
      () =>
        findInspectorBinary(
          {},
          {
            platform: 'darwin',
            arch: 'arm64',
            prebuiltDir: dir,
            localBinary: nowhere,
          }
        ),
      (error: Error) =>
        error instanceof InspectorBinaryNotFoundError &&
        error.message.includes('for darwin-arm64') &&
        error.message.includes('missing prebuilt/darwin-arm64') &&
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
        error.message.includes('darwin-arm64, linux-x64') &&
        error.message.includes('PIKKU_INSPECTOR_GO_BIN') &&
        !error.message.includes('typescript')
    )
  })
})

for (const engine of INSPECTOR_ENGINES) {
  const { executable, binEnv, platforms } = ENGINES[engine]
  const find = (env: NodeJS.ProcessEnv, options: FindInspectorBinaryOptions) =>
    findAnyInspectorBinary(env, { engine, localBinary: nowhere, ...options })

  describe(`findInspectorBinary (${engine})`, () => {
    test(`${binEnv} wins over a prebuilt binary`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'pikku-inspector-engine-'))
      const override = join(dir, 'override')
      writeFileSync(override, '')
      mkdirSync(join(dir, 'linux-x64'))
      writeFileSync(join(dir, 'linux-x64', executable), '')
      assert.equal(
        find(
          { [binEnv]: override },
          { platform: 'linux', arch: 'x64', prebuiltDir: dir }
        ),
        override
      )
    })

    test(`a ${binEnv} that does not exist names the variable`, () => {
      assert.throws(
        () => find({ [binEnv]: '/opt/nope/bin' }, {}),
        (error: Error) =>
          error instanceof InspectorBinaryNotFoundError &&
          error.message.includes(binEnv) &&
          error.message.includes('/opt/nope/bin')
      )
    })

    test('picks the prebuilt binary for each platform it ships', () => {
      const dir = mkdtempSync(join(tmpdir(), 'pikku-inspector-engine-'))
      for (const target of platforms) {
        mkdirSync(join(dir, target))
        writeFileSync(
          join(dir, target, executableName(target.split('-')[0], engine)),
          ''
        )
      }
      for (const target of platforms) {
        const [platform, arch] = target.split('-')
        assert.equal(
          find({}, { platform, arch, prebuiltDir: dir }),
          join(dir, target, executableName(platform, engine))
        )
      }
    })

    test('does not take the other engine’s binary', () => {
      const dir = mkdtempSync(join(tmpdir(), 'pikku-inspector-engine-'))
      const other = INSPECTOR_ENGINES.find((e) => e !== engine)!
      mkdirSync(join(dir, 'linux-x64'))
      writeFileSync(join(dir, 'linux-x64', executableName('linux', other)), '')
      assert.throws(
        () => find({}, { platform: 'linux', arch: 'x64', prebuiltDir: dir }),
        InspectorBinaryNotFoundError
      )
    })

    test('names this engine’s variable and binary when nothing matches', () => {
      const dir = mkdtempSync(join(tmpdir(), 'pikku-inspector-engine-'))
      assert.throws(
        () => find({}, { platform: 'darwin', arch: 'arm64', prebuiltDir: dir }),
        (error: Error) =>
          error.message.includes(`No ${executable} binary`) &&
          error.message.includes(binEnv) &&
          error.message.includes('missing prebuilt/darwin-arm64')
      )
    })

    test('names this engine’s variable on an unsupported platform', () => {
      assert.throws(
        () => find({}, { platform: 'freebsd', arch: 'x64' }),
        (error: Error) =>
          error.message.includes('no prebuilt binary') &&
          error.message.includes(platforms.join(', ')) &&
          error.message.includes(binEnv)
      )
    })
  })
}

describe('engine selection', () => {
  test('rs ships no Windows binary', () => {
    assert.equal(ENGINES.rs.platforms.includes('win32-x64'), false)
    assert.equal(executableName('linux', 'rs'), 'pikku-inspect-rs')
    assert.equal(executableName('win32', 'rs'), 'pikku-inspect-rs.exe')
  })

  test('PIKKU_INSPECTOR picks the engine; the rest is DEFAULT_ENGINE', () => {
    configureInspectorEngine(undefined)
    assert.equal(resolveInspectorEngine({}), DEFAULT_ENGINE)
    assert.equal(resolveInspectorEngine({ PIKKU_INSPECTOR: 'go' }), 'go')
    assert.equal(resolveInspectorEngine({ PIKKU_INSPECTOR: 'rs' }), 'rs')
  })

  test('the configured engine beats the default and loses to PIKKU_INSPECTOR', () => {
    try {
      for (const configured of INSPECTOR_ENGINES) {
        configureInspectorEngine(configured)
        assert.equal(resolveInspectorEngine({}), configured)
        const other: InspectorEngine = configured === 'go' ? 'rs' : 'go'
        assert.equal(resolveInspectorEngine({ PIKKU_INSPECTOR: other }), other)
      }
    } finally {
      configureInspectorEngine(undefined)
    }
  })

  test('findInspectorBinary follows the selected engine', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-inspector-engine-'))
    const go = join(dir, 'go')
    const rs = join(dir, 'rs')
    writeFileSync(go, '')
    writeFileSync(rs, '')
    const env = { PIKKU_INSPECTOR_GO_BIN: go, PIKKU_INSPECTOR_RS_BIN: rs }
    assert.equal(findAnyInspectorBinary({ ...env, PIKKU_INSPECTOR: 'go' }), go)
    assert.equal(findAnyInspectorBinary({ ...env, PIKKU_INSPECTOR: 'rs' }), rs)
    assert.equal(findAnyInspectorBinary(env), DEFAULT_ENGINE === 'go' ? go : rs)
  })

  test('an unknown engine is refused, naming where it came from', () => {
    assert.throws(
      () => resolveInspectorEngine({ PIKKU_INSPECTOR: 'ts' }),
      /PIKKU_INSPECTOR is "ts"; expected one of go, rs/
    )
    assert.throws(() => configureInspectorEngine('ts'), /inspector setting/)
  })
})

describe('package', () => {
  const pkg = readJson(join(PKG_DIR, 'package.json'))

  test('binary.ts and scripts/platforms.mjs list the same targets', () => {
    assert.deepEqual(
      [...SUPPORTED_PLATFORMS].sort(),
      PLATFORMS.map(targetName).sort()
    )
  })

  test('binary.ts and scripts/platforms.mjs list the same rs targets', () => {
    assert.deepEqual(
      [...ENGINES.rs.platforms].sort(),
      RS_PLATFORMS.map(targetName).sort()
    )
  })

  test('rs ships a subset of the platforms go does', () => {
    for (const target of ENGINES.rs.platforms) {
      assert.ok((SUPPORTED_PLATFORMS as readonly string[]).includes(target))
    }
  })

  test('ships prebuilt/ and refuses to publish without every binary', () => {
    assert.ok(pkg.files.includes('prebuilt'))
    assert.match(pkg.scripts.prepublishOnly, /check-platform-binary/)
    assert.equal(pkg.optionalDependencies, undefined)
  })
})

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

  test('accepts a dynamically linked ELF only for the Rust binary', () => {
    assert.equal(
      binaryProblem(elf(62, true), 'linux', 'x64', { allowDynamic: true }),
      undefined
    )
    assert.match(
      binaryProblem(elf(183, true), 'linux', 'x64', { allowDynamic: true }),
      /e_machine/
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
