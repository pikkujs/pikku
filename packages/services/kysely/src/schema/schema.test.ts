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
  unsatisfiedRequirements,
} from './index.js'

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
})
