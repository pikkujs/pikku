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
import { defineTables, type TablesDeclaration } from '@pikku/core/db'
import {
  applyPikkuSchemas,
  compilePikkuSchemas,
  compileTables,
  pikkuSchemas,
  tableRequirements,
} from './index.js'

type Dialect = 'sqlite' | 'postgres' | 'mysql'

const compilerFor = (kind: Dialect) =>
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

const compile = (
  kind: Dialect,
  tables: TablesDeclaration,
  types: Record<string, string> = {}
): string[] =>
  compilePikkuSchemas(
    compilerFor(kind),
    [{ name: 'app', tables }],
    types
  ).split('\n\n')

describe('compileTables: column types', () => {
  const tables = defineTables({
    everything: {
      columns: {
        id: { type: 'id', primaryKey: true },
        key: { type: 'key', required: true },
        body: { type: 'text' },
        code: { type: 'string(16)' },
        count: { type: 'integer' },
        big: { type: 'bigint' },
        ratio: { type: 'real' },
        active: { type: 'boolean' },
        at: { type: 'timestamp' },
        atTz: { type: 'timestamptz' },
        uid: { type: 'uuid' },
        doc: { type: 'json' },
      },
    },
  })

  test('sqlite', () => {
    assert.deepEqual(compile('sqlite', tables), [
      'create table "everything" ("id" text primary key, "key" text not null, "body" text, "code" varchar(16), "count" integer, "big" bigint, "ratio" real, "active" boolean, "at" timestamp, "at_tz" timestamp, "uid" text, "doc" text);',
    ])
  })

  test('postgres', () => {
    assert.deepEqual(compile('postgres', tables), [
      'create table "everything" ("id" text primary key, "key" text not null, "body" text, "code" varchar(16), "count" integer, "big" bigint, "ratio" real, "active" boolean, "at" timestamp, "at_tz" timestamptz, "uid" uuid, "doc" jsonb);',
    ])
  })

  test('mysql', () => {
    assert.deepEqual(compile('mysql', tables), [
      'create table `everything` (`id` varchar(255) primary key, `key` varchar(255) not null, `body` longtext, `code` varchar(16), `count` integer, `big` bigint, `ratio` real, `active` boolean, `at` timestamp, `at_tz` timestamp, `uid` char(36), `doc` json);',
    ])
  })

  test('refuses a bounded string of length 0', () => {
    assert.throws(
      () => compileTables({ t: { columns: { a: { type: 'string(0)' } } } }),
      /'t.a' has type 'string\(0\)'. A bounded string needs a length of at least 1/
    )
  })

  test('a text column in a key is bounded on mysql and text elsewhere', () => {
    const keyed = defineTables({
      tag: { columns: { name: { type: 'text', unique: true } } },
    })
    assert.deepEqual(compile('mysql', keyed), [
      'create table `tag` (`name` varchar(255) unique);',
    ])
    assert.deepEqual(compile('postgres', keyed), [
      'create table "tag" ("name" text unique);',
    ])
  })
})

describe('compileTables: defaults', () => {
  const tables = defineTables({
    note: {
      columns: {
        status: { type: 'text', required: true, default: 'draft' },
        count: { type: 'integer', default: 0 },
        pinned: { type: 'boolean', default: false },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        token: { type: 'uuid', default: { sql: 'gen_random_uuid()' } },
      },
    },
  })

  test('sqlite', () => {
    assert.deepEqual(compile('sqlite', tables), [
      `create table "note" ("status" text default 'draft' not null, "count" integer default 0, "pinned" boolean default false, "created_at" timestamp default CURRENT_TIMESTAMP not null, "token" text default gen_random_uuid());`,
    ])
  })

  test('postgres', () => {
    assert.deepEqual(compile('postgres', tables), [
      `create table "note" ("status" text default 'draft' not null, "count" integer default 0, "pinned" boolean default false, "created_at" timestamp default CURRENT_TIMESTAMP not null, "token" uuid default gen_random_uuid());`,
    ])
  })

  test('mysql takes a bounded string default as an expression too', () => {
    assert.deepEqual(
      compile('mysql', {
        run: {
          columns: { status: { type: 'string(50)', default: 'running' } },
        },
      }),
      ["create table `run` (`status` varchar(50) default ('running'));"]
    )
  })

  test('mysql takes a text literal default as an expression', () => {
    assert.deepEqual(compile('mysql', tables), [
      "create table `note` (`status` longtext default ('draft') not null, `count` integer default 0, `pinned` boolean default false, `created_at` timestamp default CURRENT_TIMESTAMP not null, `token` char(36) default gen_random_uuid());",
    ])
  })
})

describe('compileTables: onDelete', () => {
  const withOnDelete = (
    onDelete?: 'cascade' | 'setNull' | 'restrict' | 'noAction'
  ) =>
    defineTables({
      parent: { columns: { id: { type: 'id', primaryKey: true } } },
      child: {
        columns: {
          parentId: onDelete
            ? { references: 'parent.id', onDelete }
            : { references: 'parent.id' },
        },
      },
    })

  const cases = [
    [undefined, 'restrict'],
    ['cascade', 'cascade'],
    ['setNull', 'set null'],
    ['restrict', 'restrict'],
    ['noAction', 'no action'],
  ] as const

  for (const [onDelete, clause] of cases) {
    test(`${onDelete ?? 'the default'} compiles to on delete ${clause}`, () => {
      const tables = withOnDelete(onDelete)
      assert.equal(
        compile('sqlite', tables)[1],
        `create table "child" ("parent_id" text references "parent" ("id") on delete ${clause});`
      )
      assert.equal(
        compile('postgres', tables)[1],
        `create table "child" ("parent_id" text references "parent" ("id") on delete ${clause});`
      )
      assert.equal(
        compile('mysql', tables)[1],
        `create table \`child\` (\`parent_id\` varchar(255), constraint \`child_parent_id_fk\` foreign key (\`parent_id\`) references \`parent\` (\`id\`) on delete ${clause});`
      )
    })
  }

  test('refuses setNull on a required column', () => {
    assert.throws(
      () =>
        compileTables({
          parent: { columns: { id: { type: 'id', primaryKey: true } } },
          child: {
            columns: {
              parentId: {
                references: 'parent.id',
                onDelete: 'setNull',
                required: true,
              },
            },
          },
        }),
      /'child.parentId' is required, so onDelete 'setNull' could never succeed/
    )
  })

  test('refuses setNull on a column in a composite primary key', () => {
    assert.throws(
      () =>
        compileTables({
          parent: { columns: { id: { type: 'id', primaryKey: true } } },
          child: {
            columns: {
              parentId: { references: 'parent.id', onDelete: 'setNull' },
              seq: { type: 'integer' },
            },
            primaryKey: ['parentId', 'seq'],
          },
        }),
      /'child.parentId' is required, so onDelete 'setNull' could never succeed/
    )
  })

  test('refuses onDelete without references', () => {
    assert.throws(
      () =>
        compileTables({
          t: { columns: { a: { type: 'text', onDelete: 'cascade' } } },
        }),
      /'t.a' sets onDelete without a 'references'/
    )
  })

  test('the framework schemas keep cascading on every dialect', () => {
    for (const kind of ['sqlite', 'postgres', 'mysql'] as const) {
      const out = compilePikkuSchemas(compilerFor(kind), pikkuSchemas)
      const clauses = out.match(/on delete [a-z ]+?(?=[,)])/g) ?? []
      assert.ok(clauses.length > 0)
      assert.deepEqual(new Set(clauses), new Set(['on delete cascade']), kind)
    }
  })
})

describe('compileTables: primary keys and unique constraints', () => {
  const tables = defineTables({
    membership: {
      columns: {
        orgId: { type: 'id', required: true },
        userId: { type: 'id', required: true },
        seat: { type: 'integer' },
        email: { type: 'string(254)', unique: true },
      },
      primaryKey: ['orgId', 'userId'],
      unique: [['orgId', 'seat']],
    },
  })

  test('sqlite', () => {
    assert.deepEqual(compile('sqlite', tables), [
      'create table "membership" ("org_id" text not null, "user_id" text not null, "seat" integer, "email" varchar(254) unique, constraint "membership_pk" primary key ("org_id", "user_id"), constraint "membership_org_id_seat_key" unique ("org_id", "seat"));',
    ])
  })

  test('postgres', () => {
    assert.deepEqual(compile('postgres', tables), [
      'create table "membership" ("org_id" text not null, "user_id" text not null, "seat" integer, "email" varchar(254) unique, constraint "membership_pk" primary key ("org_id", "user_id"), constraint "membership_org_id_seat_key" unique ("org_id", "seat"));',
    ])
  })

  test('mysql', () => {
    assert.deepEqual(compile('mysql', tables), [
      'create table `membership` (`org_id` varchar(255) not null, `user_id` varchar(255) not null, `seat` integer, `email` varchar(254) unique, constraint `membership_pk` primary key (`org_id`, `user_id`), constraint `membership_org_id_seat_key` unique (`org_id`, `seat`));',
    ])
  })

  test('a named constraint keeps the name it has in a deployed database', () => {
    const named = defineTables({
      membership: {
        columns: {
          orgId: { type: 'id', required: true },
          userId: { type: 'id', required: true },
        },
        primaryKey: { name: 'pk_membership', columns: ['orgId', 'userId'] },
        unique: [{ name: 'membership_user_unique', columns: ['userId'] }],
      },
    })
    assert.deepEqual(compile('postgres', named), [
      'create table "membership" ("org_id" text not null, "user_id" text not null, constraint "pk_membership" primary key ("org_id", "user_id"), constraint "membership_user_unique" unique ("user_id"));',
    ])
  })

  test('a setNull column in a named primary key is refused', () => {
    assert.throws(
      () =>
        compileTables({
          parent: { columns: { id: { type: 'id', primaryKey: true } } },
          t: {
            columns: {
              a: { references: 'parent.id', onDelete: 'setNull' },
              b: { type: 'id' },
            },
            primaryKey: { name: 't_key', columns: ['a', 'b'] },
          },
        }),
      /onDelete 'setNull' could never succeed/
    )
  })

  test('refuses a primary key on both the table and a column', () => {
    assert.throws(
      () =>
        compileTables({
          t: {
            columns: { a: { type: 'id', primaryKey: true }, b: { type: 'id' } },
            primaryKey: ['a', 'b'],
          },
        }),
      /declares a primary key on the table and on column 'a'/
    )
  })

  test('refuses two column primary keys', () => {
    assert.throws(
      () =>
        compileTables({
          t: {
            columns: {
              a: { type: 'id', primaryKey: true },
              b: { type: 'id', primaryKey: true },
            },
          },
        }),
      /A composite key goes in the table's 'primaryKey'/
    )
  })

  test('refuses a constraint naming an undeclared column', () => {
    assert.throws(
      () =>
        compileTables({
          t: { columns: { a: { type: 'id' } }, unique: [['a', 'b']] },
        }),
      /Table 't' names 'b' in its unique constraints/
    )
  })
})

describe('compileTables: indexes', () => {
  const tables = defineTables({
    invoice: {
      columns: {
        id: { type: 'id', primaryKey: true },
        orgId: { type: 'id', index: true },
        status: { type: 'text' },
        number: { type: 'integer' },
      },
      indexes: [
        { columns: ['orgId', 'status'] },
        { columns: ['orgId', 'number'], unique: true, name: 'invoice_number' },
      ],
    },
  })

  test('sqlite and postgres', () => {
    for (const kind of ['sqlite', 'postgres'] as const) {
      assert.deepEqual(compile(kind, tables).slice(1), [
        'create index "invoice_org_id_idx" on "invoice" ("org_id");',
        'create index "invoice_org_id_status_idx" on "invoice" ("org_id", "status");',
        'create unique index "invoice_number" on "invoice" ("org_id", "number");',
      ])
    }
  })

  test('mysql', () => {
    const out = compile('mysql', tables)
    assert.match(out[0]!, /`status` varchar\(255\)/)
    assert.deepEqual(out.slice(1), [
      'create index `invoice_org_id_idx` on `invoice` (`org_id`);',
      'create index `invoice_org_id_status_idx` on `invoice` (`org_id`, `status`);',
      'create unique index `invoice_number` on `invoice` (`org_id`, `number`);',
    ])
  })

  describe('partial', () => {
    const partial = defineTables({
      job: {
        columns: {
          id: { type: 'id', primaryKey: true },
          finishedAt: { type: 'timestamp' },
        },
        indexes: [{ columns: ['id'], where: 'finished_at IS NULL' }],
      },
    })

    test('sqlite and postgres pass the where through verbatim', () => {
      for (const kind of ['sqlite', 'postgres'] as const) {
        assert.equal(
          compile(kind, partial)[1],
          'create index "job_id_idx" on "job" ("id") where finished_at IS NULL;'
        )
      }
    })

    test('mysql refuses before applying anything', async () => {
      const executed: string[] = []
      class RecordingDriver extends DummyDriver {
        override async acquireConnection() {
          return {
            executeQuery: async (query: CompiledQuery) => {
              executed.push(query.sql)
              return { rows: [] }
            },
            streamQuery: async function* () {},
          }
        }
      }
      const db = new Kysely<any>({
        dialect: {
          createAdapter: () => new MysqlAdapter(),
          createDriver: () => new RecordingDriver(),
          createIntrospector: (i: Kysely<any>) => new MysqlIntrospector(i),
          createQueryCompiler: () => new MysqlQueryCompiler(),
        },
      })
      await assert.rejects(
        applyPikkuSchemas(db, [{ name: 'app', tables: partial }]),
        /MySQL has no partial indexes/
      )
      assert.deepEqual(
        executed.filter((q) => /^create /i.test(q)),
        []
      )
    })

    test('mysql refuses, naming the index', () => {
      assert.throws(
        () => compile('mysql', partial),
        /Index 'job_id_idx' on 'job' is partial \(where finished_at IS NULL\), and MySQL has no partial indexes/
      )
    })
  })
})

describe('compileTables: references take their target type', () => {
  const tables = defineTables({
    account: { columns: { id: { type: 'uuid', primaryKey: true } } },
    project: {
      columns: {
        id: { type: 'integer', primaryKey: true },
        accountId: { references: 'account.id', onDelete: 'cascade' },
        ownerId: { references: 'user.id' },
      },
    },
    task: {
      columns: {
        projectId: { references: 'project.id' },
        accountId: { references: 'project.accountId' },
      },
    },
  })

  test('from a column in the declaration, through a chain', () => {
    const [, project, task] = compile('postgres', tables)
    assert.match(
      project!,
      /"account_id" uuid references "account" \("id"\) on delete cascade/
    )
    assert.match(task!, /"project_id" integer references "project" \("id"\)/)
    assert.match(
      task!,
      /"account_id" uuid references "project" \("account_id"\)/
    )
  })

  test('from a foreign column, through the introspected types', () => {
    assert.match(
      compile('postgres', tables, { 'user.id': 'bigint' })[1]!,
      /"owner_id" bigint references "user" \("id"\) on delete restrict/
    )
    assert.match(
      compile('postgres', tables)[1]!,
      /"owner_id" text references "user"/
    )
  })

  test('foreign targets are the requirements, in physical names', () => {
    assert.deepEqual(
      tableRequirements(
        defineTables({
          a: {
            columns: {
              x: { references: 'user.id' },
              y: { references: 'user.id' },
              z: { references: 'orgMember.memberId' },
              w: { references: 'apiURL.keyID' },
            },
          },
        }),
        'Better Auth'
      ),
      [
        { table: 'user', column: 'id', owner: 'Better Auth' },
        { table: 'org_member', column: 'member_id', owner: 'Better Auth' },
        { table: 'api_url', column: 'key_id', owner: 'Better Auth' },
      ]
    )
    assert.deepEqual(
      tableRequirements(tables).map((r) => r.table),
      ['user']
    )
  })

  test('refuses a target column the declaration does not have', () => {
    assert.throws(
      () =>
        compileTables({
          a: { columns: { id: { type: 'id' } } },
          b: { columns: { aId: { references: 'a.missing' } } },
        }),
      /'b.aId' references 'a.missing', but 'a' declares no column 'missing'/
    )
  })

  test('refuses a reference cycle with no type in it', () => {
    assert.throws(
      () =>
        compileTables({
          a: { columns: { x: { references: 'b.y' } } },
          b: { columns: { y: { references: 'a.x' } } },
        }),
      /leads back to itself/
    )
  })

  test('refuses a column with neither a type nor a reference', () => {
    assert.throws(
      () => compileTables({ a: { columns: { x: {} as never } } }),
      /'a.x' has no type/
    )
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

const live = defineTables({
  parent: {
    columns: {
      id: { type: 'id', primaryKey: true },
      createdAt: {
        type: 'timestamptz',
        required: true,
        default: { now: true },
      },
    },
  },
  cascades: {
    columns: { parentId: { references: 'parent.id', onDelete: 'cascade' } },
  },
  nulls: {
    columns: { parentId: { references: 'parent.id', onDelete: 'setNull' } },
  },
  restricts: { columns: { parentId: { references: 'parent.id' } } },
  open: {
    columns: {
      id: { type: 'id', primaryKey: true },
      doneAt: { type: 'timestamp' },
    },
    indexes: [{ columns: ['id'], where: 'done_at IS NULL', unique: true }],
  },
})

const exerciseOnDelete = async (db: Kysely<any>) => {
  await applyPikkuSchemas(db, [{ name: 'live', tables: live }])
  await sql`insert into parent (id) values ('a'), ('b')`.execute(db)
  for (const table of ['cascades', 'nulls']) {
    await sql`insert into ${sql.table(table)} (parent_id) values ('a')`.execute(
      db
    )
  }
  await sql`insert into restricts (parent_id) values ('b')`.execute(db)

  await sql`delete from parent where id = 'a'`.execute(db)
  const cascades = await sql`select * from cascades`.execute(db)
  const nulls = await sql<{
    parent_id: string | null
  }>`select * from nulls`.execute(db)
  assert.equal(cascades.rows.length, 0)
  assert.deepEqual(nulls.rows, [{ parent_id: null }])
  await assert.rejects(sql`delete from parent where id = 'b'`.execute(db))
}

describe('compileTables applied to a real database', () => {
  test('sqlite honours every onDelete and the partial index', async () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    const db = new Kysely<any>({ dialect: new SqliteDialect({ database }) })
    await exerciseOnDelete(db)
    await sql`insert into open (id, done_at) values ('x', CURRENT_TIMESTAMP)`.execute(
      db
    )
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

    test('honours every onDelete and maps timestamptz', async () => {
      await exerciseOnDelete(db)
      const { rows } = await sql<{ data_type: string }>`
        select data_type from information_schema.columns
        where table_name = 'parent' and column_name = 'created_at'`.execute(db)
      assert.equal(rows[0]!.data_type, 'timestamp with time zone')
      const index = await sql<{ indexdef: string }>`
        select indexdef from pg_indexes where indexname = 'open_id_idx'`.execute(
        db
      )
      assert.match(index.rows[0]!.indexdef, /WHERE \(done_at IS NULL\)/)
    })
  })
})

describe('compileTables: constraints', () => {
  const tables = defineTables({
    invoice: {
      columns: {
        invoiceId: { type: 'id', primaryKey: true },
        status: {
          type: 'text',
          required: true,
          default: 'draft',
          enum: ['draft', 'sent', "it's paid"],
        },
        amountCents: { type: 'integer', required: true, min: 0, max: 100 },
        slug: {
          type: 'string(64)',
          minLength: 2,
          maxLength: 64,
          pattern: '^[a-z0-9-]+$',
        },
      },
    },
  })

  test('sqlite', () => {
    assert.deepEqual(compile('sqlite', tables), [
      `create table "invoice" ("invoice_id" text primary key, "status" text default 'draft' not null constraint "invoice_status_enum_check" check ("status" in ('draft', 'sent', 'it''s paid')), "amount_cents" integer not null constraint "invoice_amount_cents_min_check" check ("amount_cents" >= 0) constraint "invoice_amount_cents_max_check" check ("amount_cents" <= 100), "slug" varchar(64) constraint "invoice_slug_minlength_check" check (length("slug") >= 2) constraint "invoice_slug_maxlength_check" check (length("slug") <= 64));`,
    ])
  })

  test('postgres', () => {
    assert.deepEqual(compile('postgres', tables), [
      `create table "invoice" ("invoice_id" text primary key, "status" text default 'draft' not null constraint "invoice_status_enum_check" check ("status" in ('draft', 'sent', 'it''s paid')), "amount_cents" integer not null constraint "invoice_amount_cents_min_check" check ("amount_cents" >= 0) constraint "invoice_amount_cents_max_check" check ("amount_cents" <= 100), "slug" varchar(64) constraint "invoice_slug_minlength_check" check (char_length("slug") >= 2) constraint "invoice_slug_maxlength_check" check (char_length("slug") <= 64));`,
    ])
  })

  test('mysql (compile only)', () => {
    const [statement] = compile('mysql', tables)
    assert.match(
      statement!,
      /`amount_cents` integer not null constraint `invoice_amount_cents_min_check` check \(`amount_cents` >= 0\)/
    )
    assert.match(
      statement!,
      /constraint `invoice_slug_maxlength_check` check \(char_length\(`slug`\) <= 64\)/
    )
    assert.match(statement!, /in \('draft', 'sent', 'it''s paid'\)/)
  })

  test('pattern never reaches SQL', () => {
    for (const dialect of ['sqlite', 'postgres', 'mysql'] as const) {
      assert.doesNotMatch(compile(dialect, tables).join('\n'), /a-z0-9/)
    }
  })

  test('a column that takes its type from a reference can be constrained', () => {
    const statements = compile('sqlite', {
      parent: { columns: { id: { type: 'integer', primaryKey: true } } },
      child: { columns: { parentId: { references: 'parent.id', min: 1 } } },
    })
    assert.match(
      statements.join('\n'),
      /constraint "child_parent_id_min_check" check \("parent_id" >= 1\)/
    )
  })

  const refused = (columns: Record<string, any>, message: RegExp) =>
    assert.throws(() => compileTables({ t: { columns } }), message)

  test('refuses a constraint the column type cannot hold', () => {
    refused(
      { a: { type: 'text', min: 1 } },
      /'t.a' is text, so it cannot have a min or max/
    )
    refused(
      { a: { type: 'integer', maxLength: 3 } },
      /'t.a' is integer, so it cannot have an enum, minLength, maxLength or pattern/
    )
    refused(
      { a: { type: 'boolean', enum: ['a'] } },
      /'t.a' is boolean, so it cannot have an enum/
    )
  })

  test('refuses values that contradict each other', () => {
    refused(
      { a: { type: 'integer', min: 5, max: 1 } },
      /min \(5\) above its max \(1\)/
    )
    refused(
      { a: { type: 'text', minLength: 5, maxLength: 1 } },
      /minLength \(5\) above its maxLength \(1\)/
    )
    refused(
      { a: { type: 'string(8)', maxLength: 9 } },
      /could never be reached/
    )
    refused({ a: { type: 'text', enum: [] } }, /non-empty list of strings/)
    refused({ a: { type: 'text', enum: ['a', 'a'] } }, /more than once/)
    refused(
      { a: { type: 'text', enum: ['a'], default: 'b' } },
      /defaults to 'b', which is not in its enum/
    )
    refused(
      { a: { type: 'text', pattern: '(' } },
      /not a valid regular expression/
    )
    refused({ a: { type: 'integer', min: Number.NaN } }, /finite number/)
    refused({ a: { type: 'text', minLength: -1 } }, /whole number/)
  })
})

describe('compileTables: constraints on a real database', () => {
  const tables = defineTables({
    item: {
      columns: {
        id: { type: 'id', primaryKey: true },
        kind: { type: 'text', enum: ['a', 'b'] },
        qty: { type: 'integer', min: 0, max: 10 },
        code: { type: 'string(8)', minLength: 2, maxLength: 4 },
      },
    },
  })

  const exercise = async (db: Kysely<any>) => {
    await applyPikkuSchemas(db, [{ name: 'app', tables }])
    await sql`insert into item (id, kind, qty, code) values ('ok', 'a', 5, 'abc')`.execute(
      db
    )
    await sql`insert into item (id) values ('nulls-pass')`.execute(db)
    for (const bad of [
      `insert into item (id, kind) values ('x', 'c')`,
      `insert into item (id, qty) values ('x', -1)`,
      `insert into item (id, qty) values ('x', 11)`,
      `insert into item (id, code) values ('x', 'a')`,
      `insert into item (id, code) values ('x', 'abcde')`,
    ]) {
      await assert.rejects(sql.raw(bad).execute(db), bad)
    }
  }

  test('sqlite enforces them', async () => {
    const db = new Kysely<any>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
    })
    await exercise(db)
    await db.destroy()
  })

  test('sqlite adds a named inline check to a populated table', async () => {
    const database = new Database(':memory:')
    database.exec(
      `create table old (id text primary key); insert into old values ('a'), ('b')`
    )
    const [statement] = compile('sqlite', {
      old: {
        columns: {
          id: { type: 'id', primaryKey: true },
          qty: { type: 'integer', min: 0 },
          kind: { type: 'text', enum: ['x', 'y'] },
        },
      },
    })
    const definitions = /\((.*)\);$/.exec(statement!)![1]!.split(/, (?=")/)
    const column = (name: string) =>
      definitions.find((d) => d.startsWith(`"${name}" `))!
    database.exec(`alter table old add column ${column('qty')}`)
    database.exec(`alter table old add column ${column('kind')}`)
    assert.equal(database.prepare('select count(*) n from old').get().n, 2)
    assert.throws(() =>
      database.exec(`insert into old (id, qty) values ('c', -1)`)
    )
    assert.throws(() =>
      database.exec(`insert into old (id, kind) values ('c', 'z')`)
    )
    database.close()
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

    test('enforces them under the names it was given', async () => {
      await exercise(db)
      const { rows } = await sql<{ conname: string }>`
        select conname from pg_constraint where conrelid = 'item'::regclass and contype = 'c'
        order by conname`.execute(db)
      assert.deepEqual(
        rows.map((r) => r.conname),
        [
          'item_code_maxlength_check',
          'item_code_minlength_check',
          'item_kind_enum_check',
          'item_qty_max_check',
          'item_qty_min_check',
        ]
      )
    })
  })
})
