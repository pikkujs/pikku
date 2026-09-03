import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertSnakeCaseIdentifiers,
  CamelCaseIdentifierError,
  findCamelCaseIdentifiers,
} from './migration-identifiers.js'

test('a snake_case migration declares nothing to complain about', () => {
  const sql = `CREATE TABLE animal (
  id TEXT NOT NULL PRIMARY KEY,
  price_cents INTEGER NOT NULL,
  weight NUMERIC(10,2),
  status TEXT CHECK (status IN ('for_sale','sold')) DEFAULT 'for_sale',
  created_at DATE NOT NULL,
  CONSTRAINT animal_price_positive CHECK (price_cents > 0),
  FOREIGN KEY (id) REFERENCES owner (id)
);
CREATE INDEX animal_status_idx ON animal (status);`

  assert.deepEqual(findCamelCaseIdentifiers('0001-animal.sql', sql), [])
})

test('a camelCase column is reported with its snake_case name', () => {
  const sql = 'CREATE TABLE animal (id TEXT PRIMARY KEY, priceCents INTEGER);'

  assert.deepEqual(findCamelCaseIdentifiers('0001-animal.sql', sql), [
    {
      file: '0001-animal.sql',
      table: 'animal',
      column: 'priceCents',
      suggestion: 'price_cents',
    },
  ])
})

test('the Better Auth schema quoting style passes as written', () => {
  const sql =
    'create table "user" ("id" text not null primary key, "email_verified" integer not null, "created_at" date not null);'

  assert.deepEqual(findCamelCaseIdentifiers('0001-better-auth.sql', sql), [])
})

test('quoting a camelCase column does not exempt it', () => {
  const sql = 'create table "user" ("id" text, "emailVerified" integer);'

  assert.deepEqual(findCamelCaseIdentifiers('0001-better-auth.sql', sql), [
    {
      file: '0001-better-auth.sql',
      table: 'user',
      column: 'emailVerified',
      suggestion: 'email_verified',
    },
  ])
})

test('a camelCase table name is reported on its own', () => {
  const sql = 'CREATE TABLE animalSale (id TEXT PRIMARY KEY);'

  assert.deepEqual(findCamelCaseIdentifiers('0001-sales.sql', sql), [
    {
      file: '0001-sales.sql',
      table: 'animalSale',
      column: null,
      suggestion: 'animal_sale',
    },
  ])
})

test('camelCase inside comments and string literals is not a declaration', () => {
  const sql = `-- priceCents used to live here; renamed for CamelCasePlugin
/* the createdAt column is a date,
   not a datetime */
CREATE TABLE animal (
  id TEXT PRIMARY KEY, -- was animalId
  status TEXT NOT NULL DEFAULT 'forSale'
);`

  assert.deepEqual(findCamelCaseIdentifiers('0001-animal.sql', sql), [])
})

test('ALTER TABLE ADD COLUMN is a declaration too', () => {
  const sql = `ALTER TABLE animal ADD COLUMN soldAt DATE;
ALTER TABLE "animal" ADD priceCents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE animal ADD COLUMN IF NOT EXISTS ownerId TEXT;`

  assert.deepEqual(
    findCamelCaseIdentifiers('0002-animal.sql', sql).map((o) => o.column),
    ['soldAt', 'priceCents', 'ownerId']
  )
})

test('an ALTER that adds a constraint declares no column', () => {
  const sql = `ALTER TABLE animal ADD CONSTRAINT animalPriceCheck CHECK (price_cents > 0);
ALTER TABLE animal ADD PRIMARY KEY (id);
ALTER TABLE animal RENAME TO beast;`

  assert.deepEqual(findCamelCaseIdentifiers('0003-animal.sql', sql), [])
})

test('every offender across every file is reported at once', () => {
  const migrations = [
    {
      name: '0001-animal.sql',
      sql: 'CREATE TABLE animal (id TEXT, priceCents INTEGER, soldAt DATE);',
    },
    {
      name: '0002-owner.sql',
      sql: 'ALTER TABLE owner ADD COLUMN displayName TEXT;',
    },
  ]

  try {
    assertSnakeCaseIdentifiers(migrations)
    assert.fail('expected a CamelCaseIdentifierError')
  } catch (error) {
    assert.ok(error instanceof CamelCaseIdentifierError)
    assert.deepEqual(
      error.offenders.map((o) => `${o.file}:${o.table}.${o.column}`),
      [
        '0001-animal.sql:animal.priceCents',
        '0001-animal.sql:animal.soldAt',
        '0002-owner.sql:owner.displayName',
      ]
    )
    assert.match(error.message, /priceCents {2}→ {2}price_cents/)
    assert.match(error.message, /displayName {2}→ {2}display_name/)
    assert.match(error.message, /replay your dev\ndatabase from scratch/)
  }
})

test('a clean set of migrations passes the assertion', () => {
  assert.doesNotThrow(() =>
    assertSnakeCaseIdentifiers([
      {
        name: '0001-animal.sql',
        sql: 'CREATE TABLE animal (price_cents INT);',
      },
    ])
  )
})
