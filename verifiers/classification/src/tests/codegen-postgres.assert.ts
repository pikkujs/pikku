/**
 * Verifies that the Postgres migration + codegen path emits the same
 * Private<T>/Secret<T> brands and classification manifest as the SQLite path.
 *
 * Uses PGlite (in-process WASM Postgres) so no running server is needed.
 * PGlite is API-compatible with pg.Client for the query/connect/end surface
 * that PostgresIntrospector and PostgresMigrationExecutor use.
 */

import { mkdtemp, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import type { Client } from 'pg'
import { PostgresMigrationExecutor } from '../../../../packages/cli/src/functions/db/postgres/postgres-migrator.js'
import { PostgresIntrospector } from '../../../../packages/cli/src/functions/db/postgres/postgres-introspector.js'
import { migrate } from '../../../../packages/cli/src/functions/db/db-migrator.js'
import { generateSchemaTypes } from '../../../../packages/cli/src/functions/db/db-codegen.js'

// ── PGlite adapter ────────────────────────────────────────────────────────────
// PGlite's query() surface matches what PostgresMigrationExecutor and
// PostgresIntrospector use internally, so a thin cast is sufficient.

function pgliteAsClient(db: PGlite): Client {
  return {
    query: (sql: string, params?: any[]) => db.query(sql, params),
    connect: async () => {},
    end: async () => db.close(),
  } as unknown as Client
}

async function setup(migrations: Record<string, string>) {
  const db = new PGlite()
  const client = pgliteAsClient(db)

  const migrationsDir = await mkdtemp(join(tmpdir(), 'pikku-pg-test-'))
  for (const [name, sql] of Object.entries(migrations)) {
    const { writeFile } = await import('fs/promises')
    await writeFile(join(migrationsDir, name), sql)
  }

  const outDir = await mkdtemp(join(tmpdir(), 'pikku-pg-out-'))

  const executor = new PostgresMigrationExecutor(client)
  await migrate(executor, migrationsDir)

  const introspector = new PostgresIntrospector(client)
  const result = await generateSchemaTypes(introspector, {
    outFile: join(outDir, 'schema.d.ts'),
    coercionFile: join(outDir, 'coercion.gen.ts'),
    manifestFile: join(outDir, 'classification.gen.ts'),
    classificationMapFile: join(outDir, 'classification-map.gen.d.ts'),
    camelCase: true,
    migrationsDir,
  })

  return { outDir, migrationsDir, db, result }
}

describe('DB codegen (Postgres) — classification brands', () => {
  test('emits Private<string> for @private columns', async (t) => {
    const { outDir, migrationsDir, db } = await setup({
      '001_users.sql': `
        CREATE TABLE users (
          id    SERIAL PRIMARY KEY,
          name  TEXT NOT NULL,
          email TEXT NOT NULL -- @private:fake:email
        );
      `,
    })
    t.after(async () => {
      await db.close()
      await rm(outDir, { recursive: true, force: true })
      await rm(migrationsDir, { recursive: true, force: true })
    })

    const schema = await readFile(join(outDir, 'schema.d.ts'), 'utf-8')
    assert.match(schema, /Private<string>/, 'email should be Private<string>')
  })

  test('emits Secret<string> for @secret columns', async (t) => {
    const { outDir, migrationsDir, db } = await setup({
      '001_tokens.sql': `
        CREATE TABLE tokens (
          id    SERIAL PRIMARY KEY,
          token TEXT NOT NULL -- @secret:hash
        );
      `,
    })
    t.after(async () => {
      await db.close()
      await rm(outDir, { recursive: true, force: true })
      await rm(migrationsDir, { recursive: true, force: true })
    })

    const schema = await readFile(join(outDir, 'schema.d.ts'), 'utf-8')
    assert.match(schema, /Secret<string>/, 'token should be Secret<string>')
  })

  test('unannotated columns default to Private', async (t) => {
    const { outDir, migrationsDir, db } = await setup({
      '001_items.sql': `
        CREATE TABLE items (
          id   SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );
      `,
    })
    t.after(async () => {
      await db.close()
      await rm(outDir, { recursive: true, force: true })
      await rm(migrationsDir, { recursive: true, force: true })
    })

    const schema = await readFile(join(outDir, 'schema.d.ts'), 'utf-8')
    assert.match(
      schema,
      /Private<string>/,
      'unannotated name should default to Private'
    )
  })

  test('@public columns have no brand', async (t) => {
    const { outDir, migrationsDir, db } = await setup({
      '001_posts.sql': `
        CREATE TABLE posts (
          id    SERIAL PRIMARY KEY, -- @public
          slug  TEXT NOT NULL       -- @public
        );
      `,
    })
    t.after(async () => {
      await db.close()
      await rm(outDir, { recursive: true, force: true })
      await rm(migrationsDir, { recursive: true, force: true })
    })

    const schema = await readFile(join(outDir, 'schema.d.ts'), 'utf-8')
    // Extract just the Posts interface block to avoid matching sql_migrations
    // (the internal tracking table has unannotated columns that default to Private)
    const postsBlock = schema.match(/export interface Posts \{[^}]+\}/)
    assert.ok(postsBlock, 'Posts interface should exist in schema')
    assert.doesNotMatch(
      postsBlock[0],
      /Private<|Pii<|Secret</,
      'public columns should have no brand'
    )
  })

  test('classification manifest records strategy correctly', async (t) => {
    const { outDir, migrationsDir, db } = await setup({
      '001_mixed.sql': `
        CREATE TABLE mixed (
          id    SERIAL PRIMARY KEY,
          pub   TEXT NOT NULL, -- @public
          priv  TEXT NOT NULL, -- @private:fake:email
          sec   TEXT NOT NULL  -- @secret:hash
        );
      `,
    })
    t.after(async () => {
      await db.close()
      await rm(outDir, { recursive: true, force: true })
      await rm(migrationsDir, { recursive: true, force: true })
    })

    const manifest = await readFile(
      join(outDir, 'classification.gen.ts'),
      'utf-8'
    )
    assert.match(manifest, /"pub"/)
    assert.match(manifest, /classification: 'public'/)
    assert.match(manifest, /"priv"/)
    assert.match(manifest, /classification: 'private'/)
    assert.match(manifest, /'fake:email'/)
    assert.match(manifest, /"sec"/)
    assert.match(manifest, /classification: 'secret'/)
    assert.match(manifest, /'hash'/)
  })

  test('ALTER TABLE ADD COLUMN annotations are parsed', async (t) => {
    const { outDir, migrationsDir, db } = await setup({
      '001_users.sql': `
        CREATE TABLE users (
          id   SERIAL PRIMARY KEY,
          name TEXT NOT NULL -- @public
        );
      `,
      '002_add_phone.sql': `
        ALTER TABLE users ADD COLUMN phone TEXT; -- @private:fake:name
      `,
    })
    t.after(async () => {
      await db.close()
      await rm(outDir, { recursive: true, force: true })
      await rm(migrationsDir, { recursive: true, force: true })
    })

    const schema = await readFile(join(outDir, 'schema.d.ts'), 'utf-8')
    assert.match(
      schema,
      /Private<string>/,
      'ALTER TABLE phone column should get Private brand'
    )

    const manifest = await readFile(
      join(outDir, 'classification.gen.ts'),
      'utf-8'
    )
    assert.match(manifest, /"phone"/)
    assert.match(manifest, /classification: 'private'/)
    assert.match(manifest, /'fake:name'/)
  })

  test('classification-map.gen.d.ts lists all tables and columns', async (t) => {
    const { outDir, migrationsDir, db } = await setup({
      '001_mixed.sql': `
        CREATE TABLE mixed (
          id    SERIAL PRIMARY KEY,
          pub   TEXT NOT NULL,
          priv  TEXT NOT NULL,
          sec   TEXT NOT NULL
        );
      `,
    })
    t.after(async () => {
      await db.close()
      await rm(outDir, { recursive: true, force: true })
      await rm(migrationsDir, { recursive: true, force: true })
    })

    const map = await readFile(
      join(outDir, 'classification-map.gen.d.ts'),
      'utf-8'
    )
    assert.match(
      map,
      /DbClassificationMap/,
      'should export DbClassificationMap'
    )
    assert.match(map, /"mixed"/, 'mixed table should be present')
    assert.match(map, /"pub"/, 'pub column should be present')
    assert.match(map, /"priv"/, 'priv column should be present')
    assert.match(map, /"sec"/, 'sec column should be present')
    assert.match(map, /ColumnEntry/, 'columns should reference ColumnEntry')
  })

  test('BOOLEAN columns map to boolean type', async (t) => {
    const { outDir, migrationsDir, db } = await setup({
      '001_flags.sql': `
        CREATE TABLE flags (
          id      SERIAL PRIMARY KEY,
          active  BOOLEAN NOT NULL DEFAULT FALSE -- @public
        );
      `,
    })
    t.after(async () => {
      await db.close()
      await rm(outDir, { recursive: true, force: true })
      await rm(migrationsDir, { recursive: true, force: true })
    })

    const schema = await readFile(join(outDir, 'schema.d.ts'), 'utf-8')
    assert.match(schema, /boolean/, 'BOOLEAN column should map to boolean')
  })
})
