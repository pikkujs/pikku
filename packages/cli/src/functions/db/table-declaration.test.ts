import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  computeDeclaredTablesDrift,
  generateMigrations,
  migrateAndCodegen,
  resolveDb,
  type ResolvedDb,
} from './local-db.js'
import { readMigrationProvenance } from './migration-provenance.js'
import {
  loadTableDeclaration,
  mergeAnnotations,
  recordedDeclaredTables,
} from './table-declaration.js'
import { databaseContext } from './db-context.js'

let root: string
let version = 0

const logger = { error: (msg: string) => assert.fail(msg) }

const ITEM = `(db, _t, ctx) => db.schema.createTable('item')
      .addColumn('id', ctx.key, (col) => col.primaryKey())
      .addColumn('name', ctx.text, (col) => col.notNull())`

/** Write `db/tables.ts`. A later write in one test has to read back as newer. */
function declare(statements: string[], rest = '') {
  mkdirSync(join(root, 'db'), { recursive: true })
  const file = join(root, 'db', 'tables.ts')
  writeFileSync(
    file,
    `export const tables = {\n  statements: [${statements.join(',\n')}],\n  ${rest}\n}\n`
  )
  const at = new Date(Date.now() + ++version * 1000)
  utimesSync(file, at, at)
}

const migrationDir = (dialect: string) => join(root, 'db', dialect)

const migrations = (dialect: string) =>
  existsSync(migrationDir(dialect))
    ? readdirSync(migrationDir(dialect))
        .filter((file) => file.includes('app-tables'))
        .sort()
    : []

/** A run, keeping only what the declaration wrote: Pikku's own tables come too. */
const generate = async (resolved: ResolvedDb) => {
  const result = await generateMigrations(
    resolved,
    root,
    ['src'],
    logger,
    [],
    new Set()
  )
  return {
    ...result,
    written: result.written.filter(({ source }) => source === 'app-tables'),
  }
}

const sqliteProject = (): ResolvedDb =>
  resolveDb({ sqliteDb: 'dev.db' }, root, join(root, '.pikku'))!

function postgresProject(schema?: string): ResolvedDb {
  mkdirSync(migrationDir('postgres'), { recursive: true })
  return resolveDb({}, root, join(root, '.pikku'), undefined, { schema })!
}

const handWritten = (dialect: string, sql: string) => {
  mkdirSync(migrationDir(dialect), { recursive: true })
  writeFileSync(join(migrationDir(dialect), '0001-init.sql'), sql)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-tables-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('declared tables on sqlite', () => {
  test('a project with no declaration generates nothing for it', async () => {
    handWritten('sqlite', 'CREATE TABLE todo (id INTEGER PRIMARY KEY);')
    const { written, refusals, upToDate } = await generate(sqliteProject())
    assert.deepEqual(written, [])
    assert.deepEqual(refusals, [])
    assert.ok(!upToDate.includes('app-tables'))
  })

  test('writes a new table, applies it, and types it', async () => {
    declare([
      ITEM,
      `(db) => db.schema.createIndex('item_name_idx').on('item').column('name')`,
    ])
    const resolved = sqliteProject()

    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    assert.deepEqual(
      written.map((w) => w.source),
      ['app-tables']
    )
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.match(sql, /create table "item"/)
    assert.match(sql, /create index "item_name_idx"/)
    assert.match(sql, /^-- pikku:tables item$/m)

    await migrateAndCodegen(resolved, { scratch: true })
    assert.match(
      readFileSync(join(root, '.pikku', 'db', 'schema.gen.ts'), 'utf8'),
      /item/i
    )
  })

  test('running it twice writes nothing the second time', async () => {
    declare([ITEM])
    const resolved = sqliteProject()
    await generate(resolved)
    const again = await generate(resolved)
    assert.deepEqual(again.written, [])
    assert.ok(again.upToDate.includes('app-tables'))
    assert.equal(migrations('sqlite').length, 1)
  })

  test('adds a column and keeps its constraints', async () => {
    declare([ITEM])
    const resolved = sqliteProject()
    await generate(resolved)

    declare([
      `(db, _t, ctx) => db.schema.createTable('owner')
        .addColumn('id', ctx.key, (col) => col.primaryKey())`,
      `${ITEM}
        .addColumn('ownerId', ctx.key, (col) => col.references('owner.id').onDelete('cascade'))
        .addColumn('qty', 'integer', (col) => col.notNull().defaultTo(0))`,
    ])
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.match(sql, /create table "owner"/)
    assert.match(
      sql,
      /ALTER TABLE "item" ADD COLUMN "owner_id" text references "owner" \("id"\) on delete cascade;/
    )
    assert.match(
      sql,
      /ALTER TABLE "item" ADD COLUMN "qty" integer default 0 not null;/
    )
    assert.ok(
      sql.indexOf('create table "owner"') < sql.indexOf('ADD COLUMN "owner_id"')
    )
    assert.equal((await computeDeclaredTablesDrift(resolved)).pending, false)
  })

  test('adds an index to a table that already exists', async () => {
    declare([ITEM])
    const resolved = sqliteProject()
    await generate(resolved)
    declare([
      ITEM,
      `(db) => db.schema.createIndex('item_name_idx').on('item').column('name')`,
    ])
    const { written } = await generate(resolved)
    assert.match(readFileSync(written[0]!.file, 'utf8'), /create index/)
    assert.deepEqual((await generate(resolved)).written, [])
  })

  test('refuses a dropped column, and says it may be a rename', async () => {
    declare([ITEM])
    const resolved = sqliteProject()
    await generate(resolved)
    const before = migrations('sqlite')

    declare([
      `(db, _t, ctx) => db.schema.createTable('item')
        .addColumn('id', ctx.key, (col) => col.primaryKey())
        .addColumn('title', ctx.text)`,
    ])
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(written, [])
    assert.equal(refusals.length, 1)
    assert.match(refusals[0]!, /item\.name is in the migrations/)
    assert.match(refusals[0]!, /rename to title/)
    assert.deepEqual(migrations('sqlite'), before)
  })

  test('refuses a table that left the declaration', async () => {
    declare([
      ITEM,
      `(db, _t, ctx) => db.schema.createTable('box').addColumn('id', ctx.key, (col) => col.primaryKey())`,
    ])
    const resolved = sqliteProject()
    await generate(resolved)

    declare([ITEM])
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(written, [])
    assert.match(refusals[0]!, /box was declared and no longer is/)
  })

  test('accepts the same table once a person has dropped it', async () => {
    declare([
      ITEM,
      `(db, _t, ctx) => db.schema.createTable('box').addColumn('id', ctx.key, (col) => col.primaryKey())`,
    ])
    const resolved = sqliteProject()
    await generate(resolved)

    declare([ITEM])
    writeFileSync(
      join(migrationDir('sqlite'), '0002-drop-box.sql'),
      'DROP TABLE box;\n'
    )
    const { refusals, upToDate } = await generate(resolved)
    assert.deepEqual(refusals, [])
    assert.ok(upToDate.includes('app-tables'))
  })

  test('refuses a changed type, nullability and default', async () => {
    handWritten(
      'sqlite',
      `CREATE TABLE item (id TEXT PRIMARY KEY, name TEXT, qty INTEGER DEFAULT 1);`
    )
    declare([
      `(db) => db.schema.createTable('item')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('name', 'integer', (col) => col.notNull())
        .addColumn('qty', 'integer', (col) => col.defaultTo(2))`,
    ])
    const { written, refusals } = await generate(sqliteProject())
    assert.deepEqual(written, [])
    assert.equal(refusals.length, 2)
    assert.match(refusals[0]!, /item\.name differs.*type.*NOT NULL/)
    assert.match(refusals[1]!, /item\.qty differs.*default is 1.*2/)
  })

  test('refuses a new NOT NULL column with nothing to fill it', async () => {
    declare([ITEM])
    const resolved = sqliteProject()
    await generate(resolved)
    declare([`${ITEM}.addColumn('sku', ctx.text, (col) => col.notNull())`])
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(written, [])
    assert.match(refusals[0]!, /item\.sku is new and NOT NULL with no default/)
  })

  test('the rehearsal catches what the engine itself refuses', async () => {
    declare([ITEM])
    const resolved = sqliteProject()
    await generate(resolved)
    declare([`${ITEM}.addColumn('sku', ctx.text, (col) => col.unique())`])
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(written, [])
    assert.match(refusals[0]!, /does not apply on top of the existing ones/)
    assert.deepEqual(migrations('sqlite').length, 1)
  })

  test('adopts a table a hand-written migration created', async () => {
    handWritten(
      'sqlite',
      `CREATE TABLE item (id text PRIMARY KEY, name text NOT NULL);
       CREATE TABLE other (id INTEGER PRIMARY KEY);`
    )
    declare([ITEM])
    const resolved = sqliteProject()
    const first = await generate(resolved)
    assert.deepEqual(first.refusals, [])
    assert.deepEqual(first.written, [])
    assert.ok(first.upToDate.includes('app-tables'))

    // A table the declaration never named stays hand-written.
    declare([`${ITEM}.addColumn('note', ctx.text)`])
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.doesNotMatch(sql, /create table/)
    assert.match(sql, /ADD COLUMN "note" text/)
    assert.doesNotMatch(sql, /other/)
  })

  test('only tables and indexes may be declared', async () => {
    declare([
      ITEM,
      `(db) => db.schema.createView('v').as(db.selectFrom('item').selectAll())`,
    ])
    const { written, refusals } = await generate(sqliteProject())
    assert.deepEqual(written, [])
    assert.match(refusals[0]!, /may only create tables and indexes/)
  })

  test('requires names a table outside the declaration', async () => {
    declare(
      [
        `(db, _t, ctx) => db.schema.createTable('item')
          .addColumn('id', ctx.key, (col) => col.primaryKey())
          .addColumn('userId', ctx.key, (col) => col.references('account.id'))`,
      ],
      `requires: [{ table: 'account', column: 'id', owner: 'The accounts migration' }],`
    )
    const resolved = sqliteProject()
    const missing = await generate(resolved)
    assert.match(
      missing.refusals[0]!,
      /requires account\.id, which no migration creates yet\. The accounts migration owns it/
    )

    handWritten('sqlite', 'CREATE TABLE account (id text PRIMARY KEY);')
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    assert.equal(written.length, 1)
    assert.doesNotMatch(
      readFileSync(written[0]!.file, 'utf8'),
      /create table "account"/
    )
  })

  test('a declaration that cannot be read stops the command', async () => {
    mkdirSync(join(root, 'db'))
    writeFileSync(join(root, 'db', 'tables.ts'), 'export const nothing = 1\n')
    await assert.rejects(() => generate(sqliteProject()), /must export/)
  })

  test('migrations that record declared tables need the file', async () => {
    declare([ITEM])
    const resolved = sqliteProject()
    await generate(resolved)
    rmSync(join(root, 'db', 'tables.ts'))
    const { refusals } = await generate(resolved)
    assert.match(refusals[0]!, /db\/tables\.ts is gone/)
  })

  test('drift says when the declaration is ahead of the migrations', async () => {
    declare([ITEM])
    const resolved = sqliteProject()
    assert.equal((await computeDeclaredTablesDrift(resolved)).pending, true)
    await generate(resolved)
    assert.equal((await computeDeclaredTablesDrift(resolved)).pending, false)
  })

  test("generated tables stay the app's in provenance", async () => {
    declare([ITEM])
    const resolved = sqliteProject()
    await generate(resolved)
    assert.equal(
      readMigrationProvenance(migrationDir('sqlite')).has('item'),
      false
    )
    assert.deepEqual(
      [...recordedDeclaredTables(migrationDir('sqlite'))],
      ['item']
    )
  })
})

describe('annotations on the declaration', () => {
  const ANNOTATED = `${ITEM}
    .addColumn('contactEmail', ctx.text)
    .addColumn('createdAt', 'timestamp')`

  test('reach the sidecar and the generated types', async () => {
    declare(
      [ANNOTATED],
      `annotations: { item: {
        contactEmail: { security: 'pii', classification: 'fake:email', format: 'email' },
        createdAt: { kind: 'date' },
      } },`
    )
    const resolved = sqliteProject()
    await generate(resolved)
    await migrateAndCodegen(resolved, { scratch: true })

    const sidecar = JSON.parse(
      readFileSync(join(root, 'db', 'annotations.gen.json'), 'utf8')
    )
    assert.deepEqual(sidecar.item.contact_email, {
      security: 'pii',
      classification: 'fake:email',
      format: 'email',
    })
    assert.match(
      readFileSync(join(root, '.pikku', 'db', 'schema.gen.ts'), 'utf8'),
      /Pii<string>/
    )
    assert.match(
      readFileSync(join(root, '.pikku', 'db', 'coercion.gen.ts'), 'utf8'),
      /created_at|createdAt/
    )
    assert.match(
      readFileSync(
        join(root, '.pikku', 'db', 'classification-map.gen.d.ts'),
        'utf8'
      ),
      /"item"\?: \{/
    )
  })

  test('a typo in a value is an error, not a default', async () => {
    declare([ITEM], `annotations: { item: { name: { security: 'pi' } } },`)
    await assert.rejects(
      () => loadTableDeclaration(root),
      /item\.name\.security is 'pi', which is not one of/
    )
  })

  test('an unknown field is an error', async () => {
    declare([ITEM], `annotations: { item: { name: { secrity: 'pii' } } },`)
    await assert.rejects(
      () => loadTableDeclaration(root),
      /unknown annotation 'secrity'/
    )
  })

  test('annotating a column that does not exist is refused', async () => {
    declare([ITEM], `annotations: { item: { nmae: { security: 'pii' } } },`)
    const { written, refusals } = await generate(sqliteProject())
    assert.deepEqual(written, [])
    assert.match(refusals[0]!, /annotates item\.nmae/)
  })

  test('merges with db/annotations.ts and keeps a schema-nested column', () => {
    const merged = mergeAnnotations(
      { app: { item: { name: { security: 'public' } } } },
      { item: { email: { security: 'pii' } } }
    )
    assert.deepEqual(merged.item, {
      name: { security: 'public' },
      email: { security: 'pii' },
    })
  })

  test('refuses a classification the two files disagree on', () => {
    assert.throws(
      () =>
        mergeAnnotations(
          { item: { email: { security: 'public' } } },
          { item: { email: { security: 'pii' } } }
        ),
      /item\.email\.security is 'public' in db\/annotations\.ts and 'pii'/
    )
  })

  test('agreeing with db/annotations.ts is fine', () => {
    assert.deepEqual(
      mergeAnnotations(
        { item: { at: { kind: 'date' } } },
        { item: { at: { kind: 'date', security: 'public' } } }
      ).item,
      { at: { kind: 'date', security: 'public' } }
    )
  })
})

describe('declared tables on postgres', () => {
  test('writes, adds a column and refuses a drop', async () => {
    declare([ITEM])
    const resolved = postgresProject()
    const first = await generate(resolved)
    assert.deepEqual(first.refusals, [])
    assert.match(
      readFileSync(first.written[0]!.file, 'utf8'),
      /create table "item"/
    )

    declare([`${ITEM}.addColumn('qty', 'integer', (col) => col.defaultTo(0))`])
    const second = await generate(resolved)
    assert.deepEqual(second.refusals, [])
    assert.match(
      readFileSync(second.written[0]!.file, 'utf8'),
      /ALTER TABLE "item" ADD COLUMN "qty" integer default 0;/
    )
    assert.equal((await computeDeclaredTablesDrift(resolved)).pending, false)

    declare([ITEM])
    const third = await generate(resolved)
    assert.deepEqual(third.written, [])
    assert.match(third.refusals[0]!, /item\.qty is in the migrations/)
  })

  test('adds a table-level constraint with its column', async () => {
    declare([ITEM])
    const resolved = postgresProject()
    await generate(resolved)
    declare([
      `(db, _t, ctx) => db.schema.createTable('item')
        .addColumn('id', ctx.key, (col) => col.primaryKey())
        .addColumn('name', ctx.text, (col) => col.notNull())
        .addColumn('code', ctx.text)
        .addUniqueConstraint('item_code_unique', ['code'])`,
    ])
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    assert.match(
      readFileSync(written[0]!.file, 'utf8'),
      /ALTER TABLE "item" ADD constraint "item_code_unique" unique \("code"\);/
    )
  })

  test('qualifies into db.schema, new tables and added columns alike', async () => {
    handWritten('postgres', 'CREATE SCHEMA app;')
    declare([ITEM])
    const resolved = postgresProject('app')
    const first = await generate(resolved)
    assert.deepEqual(first.refusals, [])
    assert.match(
      readFileSync(first.written[0]!.file, 'utf8'),
      /create table "app"\."item"/
    )
    declare([`${ITEM}.addColumn('note', ctx.text)`])
    const second = await generate(resolved)
    assert.deepEqual(second.refusals, [])
    assert.match(
      readFileSync(second.written[0]!.file, 'utf8'),
      /ALTER TABLE "app"\."item" ADD COLUMN "note" text;/
    )
  })

  test('a foreign key outside the declaration needs requires', async () => {
    handWritten('postgres', 'CREATE TABLE account (id uuid PRIMARY KEY);')
    declare([
      `(db, _t, ctx) => db.schema.createTable('item')
        .addColumn('id', ctx.key, (col) => col.primaryKey())
        .addColumn('accountId', 'uuid', (col) => col.references('account.id'))`,
    ])
    const resolved = postgresProject()
    const { refusals } = await generate(resolved)
    assert.match(refusals[0]!, /has to be listed in `requires`/)

    declare(
      [
        `(db, _t, ctx) => db.schema.createTable('item')
          .addColumn('id', ctx.key, (col) => col.primaryKey())
          .addColumn('accountId', 'uuid', (col) => col.references('account.id'))`,
      ],
      `requires: [{ table: 'account', column: 'id', owner: 'init' }],`
    )
    const ok = await generate(resolved)
    assert.deepEqual(ok.refusals, [])
    assert.equal(ok.written.length, 1)
  })
})

describe('database context', () => {
  test('says where tables are declared, and not where migrations live', async () => {
    declare([ITEM])
    const context = await databaseContext({
      rootDir: root,
      outDir: join(root, '.pikku'),
      srcDirectories: ['src'],
    })
    assert.equal(context.tables.file, 'db/tables.ts')
    assert.equal(context.tables.exists, true)
    assert.deepEqual(context.tables.declared, ['item'])
    assert.equal(context.types.schema, join('.pikku', 'db', 'schema.gen.ts'))
    assert.match(context.workflow.join('\n'), /pikku db generate/)
    assert.doesNotMatch(JSON.stringify(context), /db\/(sqlite|postgres|mysql)/)
  })

  test('answers for a project that declares nothing', async () => {
    const context = await databaseContext({
      rootDir: root,
      outDir: join(root, '.pikku'),
      srcDirectories: ['src'],
    })
    assert.equal(context.tables.exists, false)
    assert.deepEqual(context.tables.declared, [])
  })
})
