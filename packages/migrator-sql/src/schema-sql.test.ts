import test, { describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  splitStatements,
  statementShape,
  tableCreationSql,
  tableDefinitions,
  tablesInSourceOrder,
} from './schema-sql.js'

test('a semicolon inside a string literal is not a statement boundary', () => {
  const sql = `CREATE TABLE a (id TEXT, note TEXT DEFAULT 'one; two');
CREATE TABLE b (id TEXT);`

  assert.deepEqual(splitStatements(sql), [
    `CREATE TABLE a (id TEXT, note TEXT DEFAULT 'one; two');`,
    'CREATE TABLE b (id TEXT);',
  ])
})

test('a doubled quote inside a literal does not end it', () => {
  const sql = `CREATE TABLE a (note TEXT DEFAULT 'it''s; fine');`
  assert.deepEqual(splitStatements(sql), [sql])
})

test('semicolons in comments and dollar-quoted bodies are ignored', () => {
  const sql = `-- a comment; with a semicolon
CREATE TABLE a (id TEXT);
/* another; one */
CREATE FUNCTION f() RETURNS void AS $$ BEGIN; END; $$ LANGUAGE plpgsql;`

  assert.deepEqual(splitStatements(sql), [
    `-- a comment; with a semicolon
CREATE TABLE a (id TEXT);`,
    `/* another; one */
CREATE FUNCTION f() RETURNS void AS $$ BEGIN; END; $$ LANGUAGE plpgsql;`,
  ])
})

test('a trailing statement with no semicolon still counts', () => {
  assert.deepEqual(splitStatements('CREATE TABLE a (id TEXT)'), [
    'CREATE TABLE a (id TEXT)',
  ])
})

test("a table's own SQL comes back with its indexes and constraints", () => {
  const sql = `CREATE TABLE "user" ("id" text primary key);
CREATE TABLE "two_factor" ("id" text primary key, "user_id" text not null references "user" ("id"));
CREATE UNIQUE INDEX "two_factor_user_id_idx" ON "two_factor" ("user_id");
CREATE INDEX "user_id_idx" ON "user" ("id");
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_secret_check" CHECK (length("id") > 0);`

  assert.deepEqual(tableCreationSql(sql, 'two_factor'), [
    `CREATE TABLE "two_factor" ("id" text primary key, "user_id" text not null references "user" ("id"));`,
    `CREATE UNIQUE INDEX "two_factor_user_id_idx" ON "two_factor" ("user_id");`,
    `ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_secret_check" CHECK (length("id") > 0);`,
  ])
})

test('quoting, casing and a schema qualifier all name the same table', () => {
  const sql = 'create table if not exists public."Two_Factor" (id text);'
  assert.deepEqual(tableCreationSql(sql, '"two_factor"'), [sql])
  assert.deepEqual(tableCreationSql(sql, 'app.two_factor'), [sql])
})

test('a table the SQL never creates yields nothing to copy', () => {
  const sql = `CREATE TABLE "user" ("id" text primary key);
CREATE INDEX "orphan_idx" ON "orders" ("id");`

  assert.deepEqual(tableCreationSql(sql, 'orders'), [])
})

test('a referencing table is created after the one it references, not alphabetically', () => {
  const sql = `create table "channels" ("channel_id" text primary key);
create table "channel_subscriptions" ("channel_id" text not null references "channels" ("channel_id"));`

  assert.deepEqual(
    tablesInSourceOrder(sql, ['channel_subscriptions', 'channels']),
    ['channels', 'channel_subscriptions']
  )
})

test('a table the source does not create is left at the end', () => {
  const sql = 'create table "a" ("id" text);'
  assert.deepEqual(tablesInSourceOrder(sql, ['unknown', 'a']), ['a', 'unknown'])
})

test('source order survives a schema qualifier on either side', () => {
  const sql = `create table app."b" ("id" text);
create table "a" ("id" text);`

  assert.deepEqual(tablesInSourceOrder(sql, ['a', 'app.b']), ['app.b', 'a'])
})

describe('statementShape', () => {
  test('reads a table, qualified or not', () => {
    assert.deepEqual(statementShape('create table "item" ("id" text);'), {
      kind: 'table',
      table: 'item',
    })
    assert.deepEqual(
      statementShape('CREATE TABLE IF NOT EXISTS "app"."item" ("id" text);'),
      { kind: 'table', table: 'item' }
    )
  })

  test('reads an index and the table it sits on', () => {
    assert.deepEqual(
      statementShape('create unique index "i" on "app"."item" ("id");'),
      { kind: 'index', name: 'i', table: 'item' }
    )
  })

  test('calls anything else other, not a table', () => {
    assert.equal(statementShape('create view "v" as select 1;').kind, 'other')
    assert.equal(
      statementShape('create type "t" as enum (\'a\');').kind,
      'other'
    )
    assert.equal(statementShape('drop table "item";').kind, 'other')
  })
})

describe('tableDefinitions', () => {
  const sql = `create table "item" ("id" text primary key, "price" numeric(10, 2) default 0, "owner" text references "owner" ("id") on delete cascade, "note" text default 'a, b', constraint "item_owner_unique" unique ("owner", "note"));
create table "other" ("id" text);`

  test('keeps each column whole, across nested commas', () => {
    const { columns } = tableDefinitions(sql, 'item')
    assert.equal(columns.get('price'), `"price" numeric(10, 2) default 0`)
    assert.equal(
      columns.get('owner'),
      `"owner" text references "owner" ("id") on delete cascade`
    )
    assert.equal(columns.get('note'), `"note" text default 'a, b'`)
  })

  test('separates table-level constraints from columns', () => {
    const { columns, constraints } = tableDefinitions(sql, 'item')
    assert.equal(columns.size, 4)
    assert.deepEqual(constraints, [
      `constraint "item_owner_unique" unique ("owner", "note")`,
    ])
  })

  test('finds nothing for a table the SQL does not create', () => {
    assert.equal(tableDefinitions(sql, 'absent').columns.size, 0)
  })
})
