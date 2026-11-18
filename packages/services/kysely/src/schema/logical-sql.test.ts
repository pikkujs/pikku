import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteAdapter,
  SqliteDialect,
  SqliteIntrospector,
  SqliteQueryCompiler,
  sql,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely'
import Database from 'better-sqlite3'
import { PGlite } from '@electric-sql/pglite'
import type { TablesDeclaration } from '@pikku/core/db'
import {
  applyPikkuSchemas,
  compilePikkuSchemas,
  compileTables,
} from './index.js'
import { SQLITE_UUID_SQL } from './logical-sql.js'

type Engine = 'sqlite' | 'postgres' | 'mysql'

const compilerFor = (kind: Engine) =>
  new Kysely<any>({
    dialect: {
      createAdapter: () =>
        kind === 'postgres'
          ? new PostgresAdapter()
          : kind === 'mysql'
            ? new MysqlAdapter()
            : new SqliteAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db: Kysely<any>) =>
        kind === 'postgres'
          ? new PostgresIntrospector(db)
          : kind === 'mysql'
            ? new MysqlIntrospector(db)
            : new SqliteIntrospector(db),
      createQueryCompiler: () =>
        kind === 'postgres'
          ? new PostgresQueryCompiler()
          : kind === 'mysql'
            ? new MysqlQueryCompiler()
            : new SqliteQueryCompiler(),
    },
  })

const compile = (kind: Engine, tables: TablesDeclaration): string[] =>
  compilePikkuSchemas(compilerFor(kind), [{ name: 'app', tables }]).split(
    '\n\n'
  )

const note: TablesDeclaration = {
  note: {
    columns: {
      id: { type: 'uuid', primaryKey: true, default: { uuid: true } },
      title: { type: 'text', default: 'untitled' },
      createdAt: { type: 'timestamp', required: true, default: { now: true } },
      updatedAt: {
        type: 'timestamp',
        required: true,
        default: { now: true },
        onUpdate: { now: true },
      },
    },
  },
}

describe('logical defaults and onUpdate, as SQL per engine', () => {
  test('postgres: now(), gen_random_uuid(), a shared function and a trigger', () => {
    const [create, fn, trigger] = compile('postgres', note)
    assert.equal(
      create,
      'create table "note" ("id" uuid default gen_random_uuid() primary key, "title" text default \'untitled\', "created_at" timestamp default now() not null, "updated_at" timestamp default now() not null);'
    )
    assert.match(
      fn!,
      /^create or replace function "pikku_on_update"\(\) returns trigger/
    )
    assert.equal(
      trigger,
      `create trigger "note_updated_at_on_update" before update on "note" for each row when (new."updated_at" is not distinct from old."updated_at") execute function "pikku_on_update"('updated_at', 'now()');`
    )
  })

  test('mysql: CURRENT_TIMESTAMP, (UUID()) and an ON UPDATE attribute, no trigger', () => {
    assert.deepEqual(compile('mysql', note), [
      "create table `note` (`id` char(36) default (UUID()) primary key, `title` longtext default ('untitled'), `created_at` timestamp default CURRENT_TIMESTAMP not null, `updated_at` timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP);",
    ])
  })

  test('sqlite: CURRENT_TIMESTAMP, a v4 uuid built from randomblob, and an AFTER UPDATE trigger', () => {
    assert.deepEqual(compile('sqlite', note), [
      `create table "note" ("id" text default ${SQLITE_UUID_SQL} primary key, "title" text default 'untitled', "created_at" timestamp default CURRENT_TIMESTAMP not null, "updated_at" timestamp default CURRENT_TIMESTAMP not null);`,
      `create trigger "note_updated_at_on_update" after update on "note" for each row when new."updated_at" is old."updated_at" and new."updated_at" is not (CURRENT_TIMESTAMP) begin update "note" set "updated_at" = (CURRENT_TIMESTAMP) where rowid = new.rowid; end;`,
    ])
  })

  test('a literal and an sql onUpdate reach the trigger as the engine spells them', () => {
    const tables: TablesDeclaration = {
      job: {
        columns: {
          id: { type: 'id', primaryKey: true },
          state: { type: 'text', onUpdate: 'touched' },
          edits: {
            type: 'integer',
            onUpdate: { sql: { postgres: '7', sqlite: '8' } },
          },
        },
      },
    }
    const postgres = compile('postgres', tables).join('\n')
    assert.match(
      postgres,
      /execute function "pikku_on_update"\('state', '''touched'''\)/
    )
    assert.match(postgres, /execute function "pikku_on_update"\('edits', '7'\)/)
    const sqlite = compile('sqlite', tables).join('\n')
    assert.match(sqlite, /set "state" = \('touched'\)/)
    assert.match(sqlite, /set "edits" = \(8\)/)
  })

  test('a default sql takes the key of the engine being compiled', () => {
    const tables: TablesDeclaration = {
      t: {
        columns: {
          n: {
            type: 'integer',
            default: { sql: { postgres: '1', mysql: '2', sqlite: '3' } },
          },
        },
      },
    }
    assert.match(compile('postgres', tables)[0]!, /default 1\)/)
    assert.match(compile('mysql', tables)[0]!, /default 2\)/)
    assert.match(compile('sqlite', tables)[0]!, /default 3\)/)
  })

  test('a partial index where takes the key of the engine being compiled', () => {
    const tables: TablesDeclaration = {
      j: {
        columns: { id: { type: 'id' }, doneAt: { type: 'timestamp' } },
        indexes: [
          {
            columns: ['id'],
            where: { postgres: 'done_at IS NULL', sqlite: 'done_at IS NULL' },
          },
        ],
      },
    }
    assert.equal(
      compile('sqlite', tables)[1],
      'create index "j_id_idx" on "j" ("id") where done_at IS NULL;'
    )
    assert.throws(
      () =>
        compile('postgres', {
          j: {
            ...tables.j!,
            indexes: [{ columns: ['id'], where: { sqlite: 'x' } }],
          },
        } as never),
      /Index 'j_id_idx' on 'j' where has no SQL for postgres/
    )
  })
})

describe('logical defaults and onUpdate, refused', () => {
  const refused = (columns: Record<string, unknown>, expected: RegExp) =>
    assert.throws(() => compileTables({ t: { columns } } as never), expected)

  test('a missing key for the project engine names the column and the engine', () => {
    assert.throws(
      () =>
        compile('sqlite', {
          t: {
            columns: {
              c: {
                type: 'uuid',
                default: { sql: { postgres: 'gen_random_uuid()' } },
              },
            },
          },
        }),
      /t\.c default has no SQL for sqlite, the project's engine/
    )
  })

  test('an unknown engine key, an empty object and an unknown form are errors', () => {
    refused(
      { c: { type: 'text', default: { sql: { oracle: 'x' } } } },
      /'t\.c' default\.sql has the unknown engine 'oracle'/
    )
    refused({ c: { type: 'text', default: { sql: {} } } }, /names no engine/)
    refused(
      { c: { type: 'text', default: { sql: 'now()' } } },
      /must be an object with the SQL for each engine/
    )
    refused(
      { c: { type: 'text', default: { random: true } } },
      /'t\.c' default has the unknown key 'random'/
    )
    refused(
      { c: { type: 'text', default: { now: true, uuid: true } } },
      /must have exactly one of/
    )
  })

  test('uuid is for defaults and for columns that can hold one', () => {
    refused(
      { c: { type: 'timestamp', onUpdate: { uuid: true } } },
      /onUpdate has the unknown key 'uuid'/
    )
    refused(
      { c: { type: 'integer', default: { uuid: true } } },
      /'t\.c' is integer, so it cannot default to \{ uuid: true \}/
    )
    refused(
      { c: { type: 'string(8)', default: { uuid: true } } },
      /'t\.c' is string\(8\)/
    )
  })

  test('onUpdate now needs a timestamp column', () => {
    refused(
      { c: { type: 'text', onUpdate: { now: true } } },
      /'t\.c' is text, so it cannot take onUpdate \{ now: true \}/
    )
  })

  test('mysql cannot express an onUpdate other than now as an attribute', () => {
    assert.throws(
      () =>
        compile('mysql', {
          t: { columns: { c: { type: 'integer', onUpdate: 3 } } },
        }),
      /t\.c has an onUpdate other than \{ now: true \}, which MySQL cannot express/
    )
  })
})

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('logical defaults and onUpdate, executed', () => {
  const touch = async (
    db: Kysely<any>,
    nowLiteral: (iso: string) => string
  ) => {
    await applyPikkuSchemas(db, [{ name: 'app', tables: note }])
    await sql`insert into note (title, updated_at) values ('a', ${sql.raw(nowLiteral('2000-01-01 00:00:00'))})`.execute(
      db
    )
    const before = (
      await sql<any>`select id, created_at, updated_at from note`.execute(db)
    ).rows[0]
    assert.match(String(before.id), UUID_V4)
    assert.ok(new Date(before.created_at).getFullYear() >= 2025)
    assert.ok(new Date(before.updated_at).getFullYear() === 2000)

    await sql`update note set title = 'b'`.execute(db)
    const touched = (await sql<any>`select updated_at from note`.execute(db))
      .rows[0]
    assert.ok(
      new Date(touched.updated_at).getFullYear() >= 2025,
      'the trigger set updated_at'
    )

    await sql`update note set title = 'c', updated_at = ${sql.raw(nowLiteral('2001-01-01 00:00:00'))}`.execute(
      db
    )
    const explicit = (await sql<any>`select updated_at from note`.execute(db))
      .rows[0]
    assert.equal(new Date(explicit.updated_at).getFullYear(), 2001)
  }

  test('sqlite', async () => {
    const db = new Kysely<any>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
    })
    await touch(db, (iso) => `'${iso}'`)
    await db.destroy()
  })

  describe('postgres (pglite)', () => {
    let pglite: PGlite
    let db: Kysely<any>
    before(() => {
      pglite = new PGlite()
      db = new Kysely<any>({
        dialect: {
          createAdapter: () => new PostgresAdapter(),
          createDriver: () => new PGliteDriver(pglite),
          createIntrospector: (i) => new PostgresIntrospector(i),
          createQueryCompiler: () => new PostgresQueryCompiler(),
        },
      })
    })
    after(async () => {
      await pglite.close()
    })

    test('uuid, now and the trigger', async () => {
      await touch(db, (iso) => `'${iso}'`)
    })
  })
})

class PGliteDriver implements Driver {
  private readonly connection: DatabaseConnection
  constructor(private readonly db: PGlite) {
    this.connection = {
      executeQuery: async <R>(
        query: CompiledQuery
      ): Promise<QueryResult<R>> => {
        const result = await db.query<R>(query.sql, [...query.parameters])
        return { rows: result.rows }
      },
      streamQuery: async function* () {},
    }
  }
  async init() {}
  async acquireConnection() {
    return this.connection
  }
  async beginTransaction() {
    await this.db.exec('BEGIN')
  }
  async commitTransaction() {
    await this.db.exec('COMMIT')
  }
  async rollbackTransaction() {
    await this.db.exec('ROLLBACK')
  }
  async releaseConnection() {}
  async destroy() {}
}
