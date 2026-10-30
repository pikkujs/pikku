import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findSqliteLibrary,
  isCrossTarget,
  parseBunCompileTarget,
  SQLITE_LIBRARY_ENV,
} from './sqlite-library.js'

describe('findSqliteLibrary', () => {
  test('takes the library the environment names, resolved through links', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-sqlite-lib-'))
    const real = join(dir, 'libsqlite3.3.53.4.dylib')
    writeFileSync(real, '')
    symlinkSync(real, join(dir, 'libsqlite3.dylib'))

    const lookup = findSqliteLibrary(
      { [SQLITE_LIBRARY_ENV]: join(dir, 'libsqlite3.dylib') },
      'linux'
    )

    assert.equal(lookup.path, realpathSync(real))
  })

  test('says so when the named library is missing', () => {
    const lookup = findSqliteLibrary(
      { [SQLITE_LIBRARY_ENV]: '/nowhere/libsqlite3.dylib' },
      'darwin'
    )

    assert.equal(lookup.path, undefined)
    assert.match(
      (lookup as { reason: string }).reason,
      /\/nowhere\/libsqlite3.dylib/
    )
  })

  test("looks for Homebrew's sqlite on macOS", () => {
    const seen: string[] = []
    const lookup = findSqliteLibrary({}, 'darwin', (path) => {
      seen.push(path)
      return false
    })

    assert.deepEqual(seen, [
      '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib',
      '/usr/local/opt/sqlite/lib/libsqlite3.dylib',
    ])
    assert.match((lookup as { reason: string }).reason, /brew install sqlite/)
  })

  test('looks for nothing where bun brings a SQLite that loads extensions', () => {
    const lookup = findSqliteLibrary({}, 'linux', () => {
      throw new Error('nothing should be probed')
    })

    assert.equal(lookup.path, undefined)
  })
})

describe('parseBunCompileTarget', () => {
  const host = { platform: 'darwin' as const, arch: 'arm64' }

  test('is the host when no target is set', () => {
    assert.deepEqual(parseBunCompileTarget(undefined, host), host)
    assert.equal(isCrossTarget(parseBunCompileTarget('', host), host), false)
  })

  test("reads bun's target names, variants included", () => {
    assert.deepEqual(parseBunCompileTarget('bun-linux-arm64', host), {
      platform: 'linux',
      arch: 'arm64',
    })
    assert.deepEqual(parseBunCompileTarget('bun-linux-x64-musl', host), {
      platform: 'linux',
      arch: 'x64',
    })
    assert.deepEqual(parseBunCompileTarget('bun-windows-x64-baseline', host), {
      platform: 'win32',
      arch: 'x64',
    })
    assert.deepEqual(parseBunCompileTarget('bun-darwin', host), host)
  })

  test('a Linux target from a Mac is a cross build', () => {
    assert.equal(
      isCrossTarget(parseBunCompileTarget('bun-linux-arm64', host), host),
      true
    )
  })

  test('refuses a target it cannot read', () => {
    assert.throws(
      () => parseBunCompileTarget('linux-arm64', host),
      /bun-linux-arm64/
    )
    assert.throws(() => parseBunCompileTarget('bun-freebsd-x64', host))
  })
})
