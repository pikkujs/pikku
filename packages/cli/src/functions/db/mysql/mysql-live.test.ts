import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'kysely'
import {
  baseline,
  computeSchemaDrift,
  createKysely,
  devSeed,
  migrateAndCodegen,
  reset,
  resolveDb,
  type ResolvedMysqlDb,
} from '../local-db.js'
import { withMysqlClient, withScratchMysqlDatabase } from './mysql-client.js'
import { MysqlIntrospector } from './mysql-introspector.js'
import { captureScenarioBaseline } from '../scenario-baseline.js'

/**
 * These run against a real MySQL server, because MySQL has nothing embedded to
 * stand in for it: set PIKKU_TEST_MYSQL_URL to a server whose role may CREATE
 * and DROP databases, e.g. mysql://root:pikku@127.0.0.1:33306/mysql
 */
const SERVER_URL = process.env.PIKKU_TEST_MYSQL_URL

const urlFor = (database: string) => {
  const url = new URL(SERVER_URL!)
  url.pathname = `/${database}`
  return url.toString()
}

const MIGRATION_0001 = `
CREATE TABLE author (
  id INT AUTO_INCREMENT PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE post (
  id VARCHAR(36) PRIMARY KEY,
  author_id INT NOT NULL,
  status ENUM('draft','published','it''s') NOT NULL DEFAULT 'draft',
  body TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  meta JSON,
  FOREIGN KEY (author_id) REFERENCES author(id)
);
`

describe('mysql, against a real server', { skip: !SERVER_URL }, () => {
  let root: string
  let database: string
  let resolved: ResolvedMysqlDb

  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'pikku-mysql-live-'))
    database = `pikku_t_${randomBytes(5).toString('hex')}`
    await withMysqlClient(
      { connectionString: SERVER_URL! } as ResolvedMysqlDb,
      (c) => c.exec(`CREATE DATABASE \`${database}\``)
    )
    mkdirSync(join(root, 'db/mysql'), { recursive: true })
    writeFileSync(join(root, 'db/mysql/0001-init.sql'), MIGRATION_0001)
    writeFileSync(
      join(root, 'db/mysql-dev-seed.sql'),
      "INSERT INTO author (display_name) VALUES ('Ada'), ('Grace');"
    )
    resolved = resolveDb(
      { mysqlUrl: urlFor(database) },
      root,
      join(root, '.pikku')
    ) as ResolvedMysqlDb
  })

  after(async () => {
    await withMysqlClient(
      { connectionString: SERVER_URL! } as ResolvedMysqlDb,
      (c) =>
        c.exec(
          `DROP DATABASE IF EXISTS \`${database}\`; DROP DATABASE IF EXISTS pikku_scenario_baseline`
        )
    )
    rmSync(root, { recursive: true, force: true })
  })

  test('introspects columns, keys, defaults, enums and hides the tracking table', async () => {
    await withScratchMysqlDatabase(resolved, async (client) => {
      await client.exec(MIGRATION_0001)
      await client.exec(
        'CREATE TABLE sql_migrations (name VARCHAR(255) PRIMARY KEY)'
      )
      const intro = new MysqlIntrospector(client)

      assert.deepEqual(await intro.listTables(), ['author', 'post'])

      const author = Object.fromEntries(
        (await intro.getColumns('author')).map((c) => [c.name, c])
      )
      assert.equal(author.id!.pk, true)
      assert.equal(author.id!.defaultValue, 'AUTO_INCREMENT')
      assert.equal(author.display_name!.type, 'varchar(100)')
      assert.equal(author.display_name!.notNull, true)
      assert.equal(author.active!.defaultValue, '1')

      const post = Object.fromEntries(
        (await intro.getColumns('post')).map((c) => [c.name, c])
      )
      assert.deepEqual(post.status!.enumValues, ['draft', 'published', "it's"])
      assert.equal(post.body!.notNull, false)
      assert.equal(post.meta!.type, 'json')

      assert.deepEqual((await intro.getAllForeignKeys()).get('post'), [
        { column: 'author_id', foreignTable: 'author', foreignColumn: 'id' },
      ])
    })
  })

  test('scratch databases are dropped after use', async () => {
    let name = ''
    await withScratchMysqlDatabase(resolved, async (client) => {
      const { rows } = await client.query<{ db: string }>(
        'SELECT DATABASE() AS db'
      )
      name = rows[0]!.db
      assert.match(name, /^pikku_scratch_/)
    })
    await withMysqlClient(resolved, async (client) => {
      const { rows } = await client.query(
        'SELECT 1 FROM information_schema.schemata WHERE schema_name = ?',
        [name]
      )
      assert.equal(rows.length, 0)
    })
  })

  test('migrate applies the files, records them, and generates typed schema output', async () => {
    const outcome = await migrateAndCodegen(resolved)
    assert.deepEqual(outcome.migrate.applied, ['0001-init.sql'])

    const schema = readFileSync(resolved.schemaFile, 'utf8')
    assert.match(schema, /interface Author \{/)
    assert.match(
      schema,
      /id: ColumnType<Private<number>, number \| undefined, number>/
    )
    assert.match(
      schema,
      /displayName: ColumnType<Private<string>, string, string>/
    )
    assert.match(
      schema,
      /status: ColumnType<Private<'draft' \| 'published' \| 'it\\'s'>, 'draft' \| 'published' \| 'it\\'s' \| undefined/
    )
    assert.match(
      schema,
      /createdAt: ColumnType<Private<Date>, Date \| string \| undefined, Date \| string>/
    )
    assert.match(schema, /meta: ColumnType<Private<unknown> \| null/)

    const again = await migrateAndCodegen(resolved)
    assert.deepEqual(again.migrate.applied, [])
    assert.deepEqual(again.migrate.skipped, ['0001-init.sql'])
  })

  test('scratch codegen leaves the configured database untouched', async () => {
    const other = `pikku_t_${randomBytes(5).toString('hex')}`
    await withMysqlClient(resolved, (c) =>
      c.exec(`CREATE DATABASE \`${other}\``)
    )
    try {
      const target = { ...resolved, connectionString: urlFor(other) }
      const outcome = await migrateAndCodegen(target, { scratch: true })
      assert.deepEqual(outcome.migrate.applied, ['0001-init.sql'])
      await withMysqlClient(target, async (client) => {
        assert.deepEqual(await new MysqlIntrospector(client).listTables(), [])
      })
    } finally {
      await withMysqlClient(resolved, (c) =>
        c.exec(`DROP DATABASE \`${other}\``)
      )
    }
  })

  test('createKysely queries through CamelCasePlugin', async () => {
    const db = await createKysely<any>(resolved)
    try {
      await db.insertInto('author').values({ displayName: 'Linus' }).execute()
      const row = await db
        .selectFrom('author')
        .select(['displayName'])
        .where('displayName', '=', 'Linus')
        .executeTakeFirstOrThrow()
      assert.equal(row.displayName, 'Linus')
    } finally {
      await db.destroy()
    }
  })

  test('computeSchemaDrift reports a table nobody wrote down, and a missing one', async () => {
    await withMysqlClient(resolved, (c) =>
      c.exec('CREATE TABLE stray (id INT)')
    )
    const drift = await computeSchemaDrift(resolved, root, [], { error() {} })
    assert.ok(drift.extraTables.includes('stray'))
    assert.equal(drift.inSync, true)

    await withMysqlClient(resolved, (c) =>
      c.exec('DROP TABLE stray; DROP TABLE post')
    )
    const behind = await computeSchemaDrift(resolved, root, [], { error() {} })
    assert.deepEqual(behind.missingTables, ['post'])
    assert.equal(behind.inSync, false)
  })

  test('baseline refuses a database that is behind, and records one that is not', async () => {
    const behind = await baseline(resolved, root, [], { error() {} })
    assert.equal(behind.status, 'behind')

    await reset(resolved, root)
    await withMysqlClient(resolved, (c) => c.exec(MIGRATION_0001))
    const recorded = await baseline(resolved, root, [], { error() {} })
    assert.deepEqual(recorded, {
      status: 'recorded',
      recorded: ['0001-init.sql'],
    })
  })

  test('reset drops every table, and dev seed then repopulates', async () => {
    await reset(resolved, root)
    await withMysqlClient(resolved, async (client) => {
      assert.deepEqual(await new MysqlIntrospector(client).listTables(), [])
    })
    await migrateAndCodegen(resolved)
    const seeded = await devSeed(resolved)
    assert.equal(seeded.applied, true)
    await withMysqlClient(resolved, async (client) => {
      const { rows } = await client.query<{ n: number }>(
        'SELECT COUNT(*) AS n FROM author'
      )
      assert.equal(Number(rows[0]!.n), 2)
    })
  })

  test('scenario baseline restores rows and the auto-increment counter', async () => {
    const count = (table: string) =>
      withMysqlClient(resolved, async (client) => {
        const { rows } = await client.query<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${table}`
        )
        return Number(rows[0]!.n)
      })

    const base = await captureScenarioBaseline(resolved)
    try {
      assert.deepEqual(base.tables, ['author', 'post'])
      await withMysqlClient(resolved, async (client) => {
        await client.exec("INSERT INTO author (display_name) VALUES ('Extra')")
        await client.exec("DELETE FROM author WHERE display_name = 'Ada'")
      })
      await base.restore()
      assert.equal(await count('author'), 2)

      await withMysqlClient(resolved, async (client) => {
        await client.exec("INSERT INTO author (display_name) VALUES ('After')")
        const { rows } = await client.query<{ id: number }>(
          "SELECT id FROM author WHERE display_name = 'After'"
        )
        assert.equal(Number(rows[0]!.id), 3)
      })
    } finally {
      await base.drop()
    }
  })

  test('scenario baseline keeps the tables it is told to keep', async () => {
    const base = await captureScenarioBaseline(resolved, { keep: ['author'] })
    try {
      assert.deepEqual(base.tables, ['post'])
    } finally {
      await base.drop()
    }
  })

  test('the runtime schemas apply to MySQL and generate a migration', async () => {
    const other = `pikku_t_${randomBytes(5).toString('hex')}`
    await withMysqlClient(resolved, (c) =>
      c.exec(`CREATE DATABASE \`${other}\``)
    )
    try {
      const { desiredRuntimeSchema } = await import('../local-db.js')
      const target = { ...resolved, connectionString: urlFor(other) }
      const runtime = await desiredRuntimeSchema(target, root, [], {
        error() {},
      })
      assert.ok(
        runtime.tables.size > 0,
        'expected the runtime tables to materialize'
      )
      assert.match(runtime.sql, /create table `/i)
      await withMysqlClient(target, async (c) => {
        await c.exec(runtime.sql)
        const { rows } = await c.query<{ n: number }>(
          `SELECT COUNT(*) AS n FROM information_schema.referential_constraints
           WHERE constraint_schema = DATABASE() AND delete_rule = 'CASCADE'`
        )
        assert.ok(
          Number(rows[0]!.n) >= 10,
          'MySQL discards inline references, so the cascades must be table-level'
        )
      })
    } finally {
      await withMysqlClient(resolved, (c) =>
        c.exec(`DROP DATABASE \`${other}\``)
      )
    }
  })

  void sql
})
