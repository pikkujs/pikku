import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { resolveStandaloneDb } from './build-pipeline.js'
import { SQLITE_LIBRARY_ENV } from '../functions/db/sqlite/sqlite-library.js'

/** sqlite-vec's library for this platform: `vec0.dylib`, `vec0.so`, `vec0.dll`. */
const VEC0 = basename(
  createRequire(import.meta.url)('sqlite-vec').getLoadablePath()
)

const silentLogger = {
  info: () => {},
  error: () => {},
  debug: () => {},
}

let root: string
let projectDir: string
let pikkuDir: string
let unitDir: string

const writeConfig = (body: string) => {
  mkdirSync(join(projectDir, 'src'), { recursive: true })
  writeFileSync(join(projectDir, 'src', 'config.js'), body, 'utf-8')
}

const writeMigrations = (engine: 'sqlite' | 'postgres' | 'mysql') => {
  const dir = join(projectDir, 'db', engine)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '0001-init.sql'), 'select 1;', 'utf-8')
}

const resolve = (sqliteExtensions?: string[], withSqliteLibrary = false) =>
  resolveStandaloneDb(
    projectDir,
    pikkuDir,
    unitDir,
    ['src'],
    silentLogger,
    sqliteExtensions,
    { withSqliteLibrary }
  )

/** Runs `body` with PIKKU_SQLITE_LIBRARY set, restoring whatever was there. */
const withLibraryEnv = async (value: string, body: () => Promise<void>) => {
  const previous = process.env[SQLITE_LIBRARY_ENV]
  process.env[SQLITE_LIBRARY_ENV] = value
  try {
    await body()
  } finally {
    if (previous === undefined) delete process.env[SQLITE_LIBRARY_ENV]
    else process.env[SQLITE_LIBRARY_ENV] = previous
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-standalone-db-'))
  projectDir = join(root, 'project')
  pikkuDir = join(projectDir, '.pikku')
  unitDir = join(root, 'unit')
  mkdirSync(projectDir, { recursive: true })
  mkdirSync(unitDir, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('resolveStandaloneDb', () => {
  test('a project with no database at all gets none', async () => {
    assert.equal(await resolve(), undefined)
  })

  test('sqliteDb in createConfig declares a database with no migrations dir', async () => {
    writeConfig(
      `export const createConfig = async () => ({ sqliteDb: '.pikku-runtime/dev.db' })`
    )

    assert.deepEqual(await resolve(), {
      engine: 'sqlite',
      sqliteExtensions: [VEC0],
    })
  })

  test('postgresUrl in createConfig declares a database with no migrations dir', async () => {
    writeConfig(
      `export const createConfig = async () => ({ postgresUrl: 'postgres://localhost:5432/app' })`
    )

    assert.deepEqual(await resolve(), { engine: 'postgres' })
  })

  test('createConfig wins over the migrations directory', async () => {
    writeMigrations('sqlite')
    writeConfig(
      `export const createConfig = async () => ({ postgresUrl: 'postgres://localhost:5432/app' })`
    )

    assert.deepEqual(await resolve(), { engine: 'postgres' })
  })

  test('the migrations directory still answers when createConfig declares nothing', async () => {
    writeMigrations('postgres')
    writeConfig(`export const createConfig = async () => ({ port: 4002 })`)

    assert.deepEqual(await resolve(), { engine: 'postgres' })
    assert.ok(existsSync(join(unitDir, 'db', 'postgres', '0001-init.sql')))
  })

  test('a createConfig that throws falls back to the migrations directory', async () => {
    writeMigrations('sqlite')
    writeConfig(
      `export const createConfig = async () => { throw new Error('DATABASE_URL is not set') }`
    )

    assert.deepEqual(await resolve(), {
      engine: 'sqlite',
      sqliteExtensions: [VEC0],
    })
  })

  test('a createConfig that throws in a project with no database is not a build failure', async () => {
    writeConfig(
      `export const createConfig = async () => { throw new Error('DATABASE_URL is not set') }`
    )

    assert.equal(await resolve(), undefined)
  })

  test('both migration directories are refused', async () => {
    writeMigrations('sqlite')
    writeMigrations('postgres')

    await assert.rejects(resolve, /both db\/sqlite and db\/postgres migrations/)
  })

  test('a MySQL project is refused, because the bundle has no MySQL driver', async () => {
    writeMigrations('mysql')

    await assert.rejects(resolve, /no MySQL driver/)
  })

  test('mysql alongside another dialect is refused as ambiguous', async () => {
    writeMigrations('sqlite')
    writeMigrations('mysql')

    await assert.rejects(resolve, /both db\/sqlite and db\/mysql migrations/)
  })

  test('both dialects in createConfig are refused', async () => {
    writeConfig(
      `export const createConfig = async () => ({ sqliteDb: 'dev.db', postgresUrl: 'postgres://localhost:5432/app' })`
    )

    await assert.rejects(resolve, /both postgresUrl and sqliteDb/)
  })

  test('a generated coercion map travels with the database', async () => {
    writeMigrations('sqlite')
    mkdirSync(join(pikkuDir, 'db'), { recursive: true })
    writeFileSync(
      join(pikkuDir, 'db', 'coercion.gen.ts'),
      'export const coercionMap = {}',
      'utf-8'
    )

    const db = await resolve()
    assert.equal(db?.engine, 'sqlite')
    assert.match(db?.coercionImportPath ?? '', /coercion\.gen\.js$/)
  })

  test('a SQLite build ships sqlite-vec by default, with a manifest that embeds it', async () => {
    writeMigrations('sqlite')
    const db = await resolve()

    assert.deepEqual(db?.sqliteExtensions, [VEC0])
    assert.ok(existsSync(join(unitDir, 'sqlite-extensions', VEC0)))
    const manifest = readFileSync(
      join(unitDir, 'sqlite-extensions.gen.js'),
      'utf-8'
    )
    assert.match(
      manifest,
      new RegExp(
        `from './sqlite-extensions/${VEC0.replace('.', '\\.')}' with \\{ type: 'file' \\}`
      )
    )
    assert.match(manifest, new RegExp(`name: '${VEC0.replace('.', '\\.')}'`))
  })

  test('db.sqliteExtensions: [] ships none', async () => {
    writeMigrations('sqlite')
    assert.deepEqual(await resolve([]), { engine: 'sqlite' })
    assert.equal(existsSync(join(unitDir, 'sqlite-extensions')), false)
  })

  test('a Postgres build ships no SQLite extensions', async () => {
    writeMigrations('postgres')
    assert.deepEqual(await resolve(), { engine: 'postgres' })
    assert.equal(existsSync(join(unitDir, 'sqlite-extensions')), false)
  })

  describe('the SQLite library a bun build carries', () => {
    const macOnly = {
      skip:
        process.platform !== 'darwin' &&
        'only macOS swaps in a libsqlite3; bun elsewhere brings its own',
    }

    test(
      'is staged beside the extensions and embedded by the manifest',
      macOnly,
      async () => {
        writeMigrations('sqlite')
        const library = join(root, 'libsqlite3.3.53.4.dylib')
        writeFileSync(library, 'lib')

        await withLibraryEnv(library, async () => {
          const db = await resolve(undefined, true)
          assert.equal(db?.sqliteLibrary, 'libsqlite3.3.53.4.dylib')
        })
        assert.equal(
          readFileSync(
            join(unitDir, 'sqlite-extensions', 'libsqlite3.3.53.4.dylib'),
            'utf-8'
          ),
          'lib'
        )
        assert.match(
          readFileSync(join(unitDir, 'sqlite-extensions.gen.js'), 'utf-8'),
          /export const sqliteLibrary = \{ name: 'libsqlite3\.3\.53\.4\.dylib', path: library \}/
        )
      }
    )

    test(
      'is staged even when the project loads no extensions',
      macOnly,
      async () => {
        writeMigrations('sqlite')
        const library = join(root, 'libsqlite3.dylib')
        writeFileSync(library, 'lib')

        await withLibraryEnv(library, async () => {
          assert.deepEqual(await resolve([], true), {
            engine: 'sqlite',
            sqliteLibrary: 'libsqlite3.dylib',
          })
        })
      }
    )

    test('fails the build when there is none to carry', macOnly, async () => {
      writeMigrations('sqlite')
      await withLibraryEnv(join(root, 'missing.dylib'), async () => {
        await assert.rejects(resolve(undefined, true), (error: Error) => {
          assert.match(error.message, /ships its own libsqlite3/)
          assert.match(error.message, /missing\.dylib/)
          return true
        })
      })
    })

    test('is not staged for a runtime that does not ask for one', async () => {
      writeMigrations('sqlite')
      await withLibraryEnv(join(root, 'missing.dylib'), async () => {
        const db = await resolve()
        assert.equal(db?.sqliteLibrary, undefined)
      })
    })
  })

  test('an extension that cannot be resolved fails the build', async () => {
    writeMigrations('sqlite')
    await assert.rejects(
      resolve(['@not-installed/sqlite-nothing']),
      (error: Error) => {
        assert.match(error.message, /cannot be shipped in this build/)
        return true
      }
    )
  })
})
