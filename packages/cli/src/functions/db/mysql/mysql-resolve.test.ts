import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDatabaseUrl, resolveDb } from '../local-db.js'
import { parseEnumValues } from './mysql-introspector.js'

const withRoot = (fn: (root: string) => void) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-mysql-resolve-'))
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('parseDatabaseUrl routes mysql:// to mysqlUrl', () => {
  assert.deepEqual(parseDatabaseUrl('mysql://root@localhost/app'), {
    mysqlUrl: 'mysql://root@localhost/app',
  })
})

test('resolveDb resolves mysqlUrl to the mysql dialect, migrations in db/mysql', () => {
  withRoot((root) => {
    const resolved = resolveDb(
      { mysqlUrl: 'mysql://root@localhost/app' },
      root,
      root
    )
    assert.equal(resolved?.dialect, 'mysql')
    assert.equal(resolved?.migrationsDir, join(root, 'db/mysql'))
    assert.equal(resolved?.devSeedFile, join(root, 'db/mysql-dev-seed.sql'))
  })
})

test('resolveDb refuses mysqlUrl beside another dialect, naming both', () => {
  withRoot((root) => {
    assert.throws(
      () =>
        resolveDb(
          {
            mysqlUrl: 'mysql://root@localhost/app',
            postgresUrl: 'postgres://x/y',
          },
          root,
          root
        ),
      /Both postgresUrl and mysqlUrl are set/
    )
    assert.throws(
      () =>
        resolveDb(
          { mysqlUrl: 'mysql://root@localhost/app', sqliteDb: 'a.db' },
          root,
          root
        ),
      /Both sqliteDb and mysqlUrl are set/
    )
    assert.throws(
      () =>
        resolveDb(
          {
            postgresUrl: 'postgres://x/y',
            sqliteDb: 'a.db',
            mysqlUrl: 'mysql://root@localhost/app',
          },
          root,
          root
        ),
      /All of postgresUrl, sqliteDb and mysqlUrl are set/
    )
  })
})

test('resolveDb refuses db.schema on mysql', () => {
  withRoot((root) => {
    assert.throws(
      () =>
        resolveDb(
          { mysqlUrl: 'mysql://root@localhost/app' },
          root,
          root,
          undefined,
          {
            schema: 'app',
          }
        ),
      /resolved database is mysql/
    )
  })
})

test('db/mysql with no mysqlUrl is an error, not a silent null — there is no embedded MySQL', () => {
  withRoot((root) => {
    mkdirSync(join(root, 'db/mysql'), { recursive: true })
    assert.throws(() => resolveDb({}, root, root), /no mysqlUrl is configured/)
  })
})

test('parseEnumValues reads the values out of an enum column type, unescaping quotes', () => {
  assert.deepEqual(parseEnumValues("enum('draft','published','it''s')"), [
    'draft',
    'published',
    "it's",
  ])
  assert.equal(parseEnumValues('varchar(255)'), undefined)
})
