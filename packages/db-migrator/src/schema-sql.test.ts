import test from 'node:test'
import assert from 'node:assert/strict'

import { splitStatements, tableCreationSql } from './schema-sql.js'

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
