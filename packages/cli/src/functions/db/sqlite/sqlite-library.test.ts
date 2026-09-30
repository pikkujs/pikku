import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findSqliteLibrary, SQLITE_LIBRARY_ENV } from './sqlite-library.js'

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
