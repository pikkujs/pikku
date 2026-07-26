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
  DummyDriver,
} from 'kysely'
import { pikkuSchemas, compilePikkuSchemas } from './index.js'

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
