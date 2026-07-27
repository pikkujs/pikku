import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  SqliteDialect,
  DummyDriver,
} from 'kysely'
import Database from 'better-sqlite3'
import {
  pikkuSchemas,
  compilePikkuSchemas,
  applyPikkuSchemas,
  ensurePikkuSchema,
  declaredTables,
  unsatisfiedRequirements,
  type PikkuSchema,
} from './index.js'
import { workflowSchema } from './workflow.schema.js'

const dialect = (kind: 'postgres' | 'sqlite') =>
  kind === 'postgres'
    ? {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (db: Kysely<any>) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      }
    : {
        createAdapter: () => new SqliteAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (db: Kysely<any>) => new SqliteIntrospector(db),
        createQueryCompiler: () => new SqliteQueryCompiler(),
      }

const compileFor = (kind: 'postgres' | 'sqlite') =>
  compilePikkuSchemas(new Kysely<any>({ dialect: dialect(kind) }))

describe('pikku runtime schema', () => {
  test('declares logical names and compiles them to physical ones', () => {
    const sql = compileFor('postgres')

    // The declaration says `aiThreads.resourceId`, matching how every query in
    // the package addresses it; the plugin is what makes the table `ai_threads`.
    assert.match(sql, /create table "ai_threads"/)
    assert.match(sql, /"resource_id" varchar\(255\) not null/)
    assert.doesNotMatch(
      sql,
      /"aiThreads"/,
      'a camelCase table name means the plugin was not applied'
    )
  })

  test('rewrites foreign key targets too', () => {
    assert.match(
      compileFor('postgres'),
      /references "ai_threads" \("id"\)/,
      'an unrewritten reference target points at a table that does not exist'
    )
  })

  test('compiles for every dialect from the one declaration', () => {
    for (const kind of ['postgres', 'sqlite'] as const) {
      const sql = compileFor(kind)
      assert.match(sql, /create table "workflow_runs"/, `${kind} workflow_runs`)
      assert.match(sql, /create table "pikku_scopes"/, `${kind} pikku_scopes`)
    }
  })

  test('carries the ai_run column the two old declarations disagreed on', () => {
    assert.match(compileFor('postgres'), /"pending_approvals" text/)
  })

  test('creates tables outright rather than if-not-exists', () => {
    // A migration runs once. `if not exists` would let a table that already
    // exists in a different shape pass silently, which is the drift the
    // migration is supposed to surface.
    assert.doesNotMatch(compileFor('postgres'), /create table if not exists/)
  })

  test('drops the frozen uuid default from workflow primary keys', () => {
    // It was `sql.raw("'" + crypto.randomUUID() + "'")`, evaluated once when the
    // statement was built, so every row shared one default.
    assert.match(
      compileFor('postgres'),
      /"workflow_run_id" text primary key,/,
      'the primary key should carry no default at all'
    )
    assert.match(compileFor('postgres'), /"workflow_step_id" text primary key,/)
    assert.match(compileFor('postgres'), /"history_id" text primary key,/)
  })

  test('every schema is named, for the migration it will be written into', () => {
    const names = pikkuSchemas.map((s) => s.name)
    assert.equal(new Set(names).size, names.length, 'names must be unique')
    assert.ok(names.every((n) => /^[a-z][a-z-]*$/.test(n)))
  })
})

describe('pikku runtime schema — prerequisites', () => {
  const memoryDb = () =>
    new Kysely<any>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
    })

  test('names the missing table and who owns it, before creating anything', async () => {
    const db = memoryDb()
    try {
      await assert.rejects(
        applyPikkuSchemas(db),
        /The 'scope' schema requires 'user\.id', which nothing has created\. Better Auth owns it/
      )

      const created = await db.introspection.getTables()
      assert.deepEqual(
        created.map((t) => t.name),
        [],
        'a failed prerequisite must not leave a half-applied database'
      )
    } finally {
      await db.destroy()
    }
  })

  test('applies in full once the prerequisite is there', async () => {
    const db = memoryDb()
    try {
      await db.schema
        .createTable('user')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .execute()

      assert.deepEqual(await unsatisfiedRequirements(db), [])
      await applyPikkuSchemas(db)

      const created = new Set(
        (await db.introspection.getTables()).map((t) => t.name)
      )
      assert.ok(created.has('pikku_user_role'))
      assert.ok(created.has('workflow_runs'))
    } finally {
      await db.destroy()
    }
  })

  test('takes the grant column type from the user id it references', () => {
    // The hand-written DDL said `text`. Better Auth generates a `uuid` primary
    // key on postgres, and postgres rejects a text column referencing it —
    // which is why projects ended up writing these tables by hand.
    const sql = compilePikkuSchemas(
      new Kysely<any>({ dialect: dialect('postgres') }),
      pikkuSchemas,
      { 'user.id': 'uuid' }
    )
    assert.match(
      sql,
      /create table "pikku_user_role" \("user_id" uuid not null references "user" \("id"\)/
    )
    assert.match(
      sql,
      /create table "pikku_user_scope" \("user_id" uuid not null references "user" \("id"\)/
    )
  })

  test('reports the gap as data, so a caller can describe it instead of dying', async () => {
    const db = memoryDb()
    try {
      const unmet = await unsatisfiedRequirements(db)
      assert.deepEqual(
        unmet.map(({ schema, requirement }) => ({
          schema: schema.name,
          ...requirement,
        })),
        [{ schema: 'scope', table: 'user', column: 'id', owner: 'Better Auth' }]
      )

      // The rest of the declaration does not depend on auth, so it still applies.
      const satisfiable = pikkuSchemas.filter((s) => s.name !== 'scope')
      await applyPikkuSchemas(db, satisfiable)
      const created = new Set(
        (await db.introspection.getTables()).map((t) => t.name)
      )
      assert.ok(created.has('workflow_runs'))
      assert.equal(created.has('pikku_user_role'), false)
    } finally {
      await db.destroy()
    }
  })

  test('a statement failing part way takes the ones before it with it', async () => {
    const db = memoryDb()
    try {
      await db.schema.createTable('taken').addColumn('id', 'text').execute()

      // The prerequisite check cannot see this coming: nothing is missing, the
      // second statement simply collides with a table the database already has.
      const collides: PikkuSchema = {
        name: 'collides',
        statements: [
          (db) => db.schema.createTable('first').addColumn('id', 'text'),
          (db) => db.schema.createTable('taken').addColumn('id', 'text'),
        ],
      }

      await assert.rejects(applyPikkuSchemas(db, [collides]))

      const created = new Set(
        (await db.introspection.getTables()).map((t) => t.name)
      )
      assert.equal(
        created.has('first'),
        false,
        'the statement that succeeded must roll back with the one that did not'
      )
    } finally {
      await db.destroy()
    }
  })
})

describe('ensurePikkuSchema — what a service does at boot', () => {
  const memoryDb = () =>
    new Kysely<any>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
    })

  test('creates the tables the first time and finds them the second', async () => {
    const db = memoryDb()
    try {
      assert.equal(await ensurePikkuSchema(db, workflowSchema), 'created')
      assert.equal(await ensurePikkuSchema(db, workflowSchema), 'present')
    } finally {
      await db.destroy()
    }
  })

  test('two services declaring the same schema do not fight over it', async () => {
    // The workflow service and the workflow mirror both own these tables, and
    // both call init(). Whoever runs second must find them and stop, rather
    // than issuing DDL the database will reject.
    const db = memoryDb()
    try {
      assert.equal(await ensurePikkuSchema(db, workflowSchema), 'created')
      assert.equal(await ensurePikkuSchema(db, workflowSchema), 'present')
    } finally {
      await db.destroy()
    }
  })

  test('refuses a half-applied schema rather than filling in the rest', async () => {
    // Something else already owns part of it — a migration, an older release,
    // a hand-run script. Creating the remainder at boot leaves two authorities
    // over one set of tables, which is the condition all of this exists to end.
    const db = memoryDb()
    try {
      await db.schema
        .createTable('workflow_runs')
        .addColumn('workflow_run_id', 'text', (col) => col.primaryKey())
        .execute()

      await assert.rejects(
        ensurePikkuSchema(db, workflowSchema),
        /The 'workflow' schema is half applied/
      )
    } finally {
      await db.destroy()
    }
  })
})

describe('ensurePikkuSchema — a connection bound to a schema', () => {
  const WORKFLOW_TABLES = [
    'workflow_runs',
    'workflow_step',
    'workflow_step_history',
    'workflow_versions',
  ]

  /**
   * A postgres connection whose introspection answers with `tables`.
   *
   * Stubbed rather than run against a real database because sqlite has one
   * schema and nothing else here speaks postgres — and introspection is the
   * only thing `ensurePikkuSchema` reads before it decides. DummyDriver takes
   * whatever DDL follows.
   */
  const introspecting = (tables: Array<{ schema: string; name: string }>) =>
    new Kysely<any>({
      dialect: {
        ...dialect('postgres'),
        createIntrospector: () => ({
          getSchemas: async () => [],
          getMetadata: async () => ({ tables: [] }),
          getTables: async () =>
            tables.map(({ schema, name }) => ({
              schema,
              name,
              isView: false,
              columns: [],
            })),
        }),
      },
    })

  test('reads the schema out of its own DDL, not the table name', () => {
    const db = new Kysely<any>({ dialect: dialect('postgres') })

    assert.deepEqual(declaredTables(workflowSchema, db.withSchema('app')), [
      { schema: 'app', name: 'workflow_runs' },
      { schema: 'app', name: 'workflow_step' },
      { schema: 'app', name: 'workflow_step_history' },
      { schema: 'app', name: 'workflow_versions' },
    ])

    // Unqualified DDL resolves against the connection's search_path, which is
    // not knowable from here — so there is no schema to report.
    assert.deepEqual(
      declaredTables(workflowSchema, db),
      WORKFLOW_TABLES.map((name) => ({ schema: undefined, name }))
    )
  })

  test('finds tables that already exist under that schema', async () => {
    // The regression this exists for: a `withSchema('app')` connection reading
    // its own `create table "app"."workflow_runs"` as a table called `app`,
    // concluding every table was missing, and issuing a bare CREATE that the
    // database rejects with `relation "workflow_runs" already exists` — on
    // every boot, forever.
    const db = introspecting(
      WORKFLOW_TABLES.map((name) => ({ schema: 'app', name }))
    )

    assert.equal(
      await ensurePikkuSchema(db.withSchema('app'), workflowSchema),
      'present'
    )
  })

  test('does not accept the same names in a different schema', async () => {
    // `withSchema('app')` reads and writes `app.workflow_runs`. A
    // `public.workflow_runs` is a different table and answers nothing.
    const db = introspecting(
      WORKFLOW_TABLES.map((name) => ({ schema: 'public', name }))
    )

    assert.equal(
      await ensurePikkuSchema(db.withSchema('app'), workflowSchema),
      'created'
    )
  })

  test('still matches on the bare name when the connection is unbound', async () => {
    const db = introspecting(
      WORKFLOW_TABLES.map((name) => ({ schema: 'public', name }))
    )

    assert.equal(await ensurePikkuSchema(db, workflowSchema), 'present')
  })

  test('names the schema when it reports a half-applied one', async () => {
    const db = introspecting([{ schema: 'app', name: 'workflow_runs' }])

    await assert.rejects(
      ensurePikkuSchema(db.withSchema('app'), workflowSchema),
      /app\.workflow_step.*missing.*app\.workflow_runs already there/s
    )
  })
})
