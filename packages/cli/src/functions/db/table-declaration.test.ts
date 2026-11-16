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
  declaredSqliteConstraintNotice,
  generateMigrations,
  migrateAndCodegen,
  planDeclaredTables,
  resolveDb,
  type ResolvedDb,
} from './local-db.js'
import {
  MigrationDestructiveError,
  destructiveReasons,
} from '@pikku/migrator-sql'
import { loadSqliteRuntime } from '@pikku/migrator-sql/sqlite'
import { readMigrationProvenance } from './migration-provenance.js'
import {
  loadTableDeclaration,
  recordedDeclaredTables,
  TABLES_FILE,
} from './table-declaration.js'
import { databaseContext } from './db-context.js'

let root: string
let version = 0

const logger = { error: (msg: string) => assert.fail(msg) }

const ITEM_COLUMNS = `id: { type: 'key', primaryKey: true },
      name: { type: 'text', required: true },`

/** The `item` table, with any further columns and table fields. */
const item = (columns = '', rest = '') =>
  `item: { columns: { ${ITEM_COLUMNS} ${columns} }, ${rest} }`

const ITEM = item()

/** Write `db/tables.ts`. A later write in one test has to read back as newer. */
function declare(...tables: string[]) {
  writeSource(`export const tables = {\n  ${tables.join(',\n  ')}\n}\n`)
}

function writeSource(source: string) {
  mkdirSync(join(root, 'db'), { recursive: true })
  const file = join(root, 'db', 'tables.ts')
  writeFileSync(file, source)
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
const generate = async (
  resolved: ResolvedDb,
  options: { allowDestructive?: boolean } = {}
) => {
  const result = await generateMigrations(
    resolved,
    root,
    ['src'],
    logger,
    [],
    new Set(),
    options
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
    declare(item('', `indexes: [{ columns: ['name'] }]`))
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
    declare(ITEM)
    const resolved = sqliteProject()
    await generate(resolved)
    const again = await generate(resolved)
    assert.deepEqual(again.written, [])
    assert.ok(again.upToDate.includes('app-tables'))
    assert.equal(migrations('sqlite').length, 1)
  })

  test('adds a column and keeps its constraints', async () => {
    declare(ITEM)
    const resolved = sqliteProject()
    await generate(resolved)

    declare(
      `owner: { columns: { id: { type: 'key', primaryKey: true } } }`,
      item(`ownerId: { references: 'owner.id', onDelete: 'cascade' },
        qty: { type: 'integer', required: true, default: 0 },`)
    )
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
    declare(ITEM)
    const resolved = sqliteProject()
    await generate(resolved)
    declare(item('', `indexes: [{ columns: ['name'] }]`))
    const { written } = await generate(resolved)
    assert.match(readFileSync(written[0]!.file, 'utf8'), /create index/)
    assert.deepEqual((await generate(resolved)).written, [])
  })

  test('accepts the same table once a person has dropped it', async () => {
    declare(ITEM, `box: { columns: { id: { type: 'key', primaryKey: true } } }`)
    const resolved = sqliteProject()
    await generate(resolved)

    declare(ITEM)
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
    declare(`item: { columns: {
      id: { type: 'text', primaryKey: true },
      name: { type: 'integer', required: true },
      qty: { type: 'integer', default: 2 },
    } }`)
    const { written, refusals } = await generate(sqliteProject())
    assert.deepEqual(written, [])
    assert.equal(refusals.length, 2)
    assert.match(refusals[0]!, /item\.name differs.*type.*NOT NULL/)
    assert.match(refusals[1]!, /item\.qty differs.*default is 1.*2/)
  })

  test('refuses a new NOT NULL column with nothing to fill it', async () => {
    declare(ITEM)
    const resolved = sqliteProject()
    await generate(resolved)
    declare(item(`sku: { type: 'text', required: true },`))
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(written, [])
    assert.match(refusals[0]!, /item\.sku is new and NOT NULL with no default/)
  })

  test('the rehearsal catches what the engine itself refuses', async () => {
    declare(ITEM)
    const resolved = sqliteProject()
    await generate(resolved)
    declare(item(`sku: { type: 'text', unique: true },`))
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
    declare(ITEM)
    const resolved = sqliteProject()
    const first = await generate(resolved)
    assert.deepEqual(first.refusals, [])
    assert.deepEqual(first.written, [])
    assert.ok(first.upToDate.includes('app-tables'))

    // A table the declaration never named stays hand-written.
    declare(item(`note: { type: 'text' },`))
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.doesNotMatch(sql, /create table/)
    assert.match(sql, /ADD COLUMN "note" text/)
    assert.doesNotMatch(sql, /other/)
  })

  test('the old statements shape is refused, pointing at the migration notes', async () => {
    writeSource(
      `export const tables = { statements: [(db) => db.schema.createTable('item')] }\n`
    )
    await assert.rejects(
      () => generate(sqliteProject()),
      /old `defineTables\(\{ statements \}\)` shape.*docs\/MIGRATION\.md/
    )
  })

  test('a field a table does not have is refused, not ignored', async () => {
    declare(item('', `requires: []`))
    await assert.rejects(
      () => loadTableDeclaration(root),
      /item has an unknown field 'requires'/
    )
  })

  test('a mistake in the declaration is a sentence naming the column', async () => {
    declare(item(`ownerId: { references: 'owner' },`))
    await assert.rejects(
      () => loadTableDeclaration(root),
      /item\.ownerId references 'owner', which is not a 'table\.column' target/
    )
  })

  test('a reference outside the declaration needs a migration to create it', async () => {
    declare(item(`userId: { references: 'account.id' },`))
    const resolved = sqliteProject()
    const missing = await generate(resolved)
    assert.match(
      missing.refusals[0]!,
      /references account\.id, which neither it nor any migration creates/
    )

    handWritten('sqlite', 'CREATE TABLE account (id text PRIMARY KEY);')
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    assert.equal(written.length, 1)
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.doesNotMatch(sql, /create table "account"/)
    assert.match(sql, /"user_id" text references "account" \("id"\)/i)
  })

  test('a declaration that cannot be read stops the command', async () => {
    mkdirSync(join(root, 'db'))
    writeFileSync(join(root, 'db', 'tables.ts'), 'export const nothing = 1\n')
    await assert.rejects(() => generate(sqliteProject()), /must export/)
  })

  test('migrations that record declared tables need the file', async () => {
    declare(ITEM)
    const resolved = sqliteProject()
    await generate(resolved)
    rmSync(join(root, 'db', 'tables.ts'))
    const { refusals } = await generate(resolved)
    assert.match(refusals[0]!, /db\/tables\.ts is gone/)
  })

  test('drift says when the declaration is ahead of the migrations', async () => {
    declare(ITEM)
    const resolved = sqliteProject()
    assert.equal((await computeDeclaredTablesDrift(resolved)).pending, true)
    await generate(resolved)
    assert.equal((await computeDeclaredTablesDrift(resolved)).pending, false)
  })

  test("generated tables stay the app's in provenance", async () => {
    declare(ITEM)
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
  const ANNOTATED = item(`
    contactEmail: { type: 'text', security: 'pii', classification: 'fake:email', format: 'email' },
    createdAt: { type: 'timestamp', kind: 'date' },`)

  test('reach the sidecar and the generated types', async () => {
    declare(ANNOTATED)
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
    assert.ok(
      !existsSync(join(root, '.pikku', 'db', 'classification-map.gen.d.ts')),
      'no classification map is generated'
    )
  })

  test('a typo in a value is an error, not a default', async () => {
    declare(`item: { columns: { name: { type: 'text', security: 'pi' } } }`)
    await assert.rejects(
      () => loadTableDeclaration(root),
      /item\.name\.security is 'pi', which is not one of/
    )
  })

  test('an unknown field is an error', async () => {
    declare(`item: { columns: { name: { type: 'text', secrity: 'pii' } } }`)
    await assert.rejects(
      () => loadTableDeclaration(root),
      /item\.name has an unknown field 'secrity'/
    )
  })

  test('are read off the columns, in physical names', async () => {
    declare(ANNOTATED)
    const declaration = await loadTableDeclaration(root)
    assert.deepEqual(declaration!.annotations, {
      item: {
        contact_email: {
          security: 'pii',
          classification: 'fake:email',
          format: 'email',
        },
        created_at: { kind: 'date' },
      },
    })
  })

  test('a leftover db/annotations.ts is refused with where its entries went', async () => {
    declare(ANNOTATED)
    writeFileSync(
      join(root, 'db', 'annotations.ts'),
      'export const classifications = {}\n'
    )
    await assert.rejects(
      () => loadTableDeclaration(root),
      /db\/annotations\.ts is no longer read: .*docs\/MIGRATION\.md/
    )
  })

  test('the sidecar holds only what the declaration says', async () => {
    declare(ANNOTATED)
    const resolved = sqliteProject()
    await generate(resolved)
    await migrateAndCodegen(resolved)
    assert.deepEqual(
      JSON.parse(
        readFileSync(join(root, 'db', 'annotations.gen.json'), 'utf8')
      ),
      (await loadTableDeclaration(root))!.annotations
    )
    rmSync(join(root, TABLES_FILE))
    await migrateAndCodegen(resolved)
    assert.ok(
      !existsSync(join(root, 'db', 'annotations.gen.json')),
      'a sidecar nothing declares is removed'
    )
  })
})

describe('declareOnly tables', () => {
  const ACCOUNT = `CREATE TABLE account (id text PRIMARY KEY, email text NOT NULL, created_at text);`
  const account = (columns: string) =>
    `account: { declareOnly: true, columns: { ${columns} } }`

  test('get no SQL and no marker, but their annotations and types', async () => {
    handWritten('sqlite', ACCOUNT)
    declare(
      account(`id: { type: 'key', primaryKey: true },
        email: { type: 'text', security: 'pii' },
        createdAt: { type: 'timestamp', kind: 'date' },`),
      item(`accountId: { references: 'account.id' },`)
    )
    const resolved = sqliteProject()
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.doesNotMatch(sql, /create table "account"/)
    assert.match(sql, /^-- pikku:tables item$/m)
    assert.deepEqual(
      [...recordedDeclaredTables(migrationDir('sqlite'))],
      ['item']
    )

    await migrateAndCodegen(resolved, { scratch: true })
    const sidecar = JSON.parse(
      readFileSync(join(root, 'db', 'annotations.gen.json'), 'utf8')
    )
    assert.deepEqual(sidecar.account.email, { security: 'pii' })
    assert.ok((await generate(resolved)).upToDate.includes('app-tables'))
  })

  test('are never changed, so a column they lack is not added', async () => {
    handWritten('sqlite', ACCOUNT)
    declare(
      account(`id: { type: 'key', primaryKey: true },
        email: { type: 'text' },
        nickname: { type: 'text' },`)
    )
    const { written, refusals } = await generate(sqliteProject())
    assert.deepEqual(written, [])
    assert.deepEqual(refusals, [
      'db/tables.ts declares account.nickname, which the migrations do not create.',
    ])
  })

  test('a type the table does not hold is an error', async () => {
    handWritten('sqlite', ACCOUNT)
    declare(account(`email: { type: 'integer' },`))
    const { refusals } = await generate(sqliteProject())
    assert.match(
      refusals[0]!,
      /account\.email is text in the migrations, which does not hold the 'integer'/i
    )
  })

  test('a kind the table does not hold is an error', async () => {
    handWritten('sqlite', ACCOUNT)
    declare(account(`email: { type: 'text', kind: 'bool' },`))
    const { refusals } = await generate(sqliteProject())
    assert.match(refusals[0]!, /does not hold the kind 'bool'/)
  })

  test('a table no migration creates is an error', async () => {
    declare(account(`id: { type: 'key', primaryKey: true },`))
    const { refusals } = await generate(sqliteProject())
    assert.match(
      refusals[0]!,
      /declares account as declareOnly, but no migration creates it/
    )
  })

  test('a generated table that becomes declareOnly is not a dropped one', async () => {
    declare(ITEM)
    const resolved = sqliteProject()
    await generate(resolved)
    declare(`item: { declareOnly: true, columns: { ${ITEM_COLUMNS} } }`)
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    assert.deepEqual(written, [])
  })
})

const USER_COLUMNS = (extra: string) =>
  `note: { columns: { id: { type: 'key', primaryKey: true }, title: { type: 'text', required: true }, ${extra} } }`

const sqliteRows = async (resolved: ResolvedDb, query: string) => {
  if (resolved.dialect !== 'sqlite') throw new Error('expected sqlite')
  const db = (await loadSqliteRuntime()).open(resolved.dbFile)
  try {
    return db.prepare(query).all() as Record<string, unknown>[]
  } finally {
    db.close()
  }
}

const sqliteRun = async (resolved: ResolvedDb, statement: string) => {
  if (resolved.dialect !== 'sqlite') throw new Error('expected sqlite')
  const db = (await loadSqliteRuntime()).open(resolved.dbFile)
  try {
    db.prepare(statement).run()
  } finally {
    db.close()
  }
}

describe('destructive changes on sqlite', () => {
  const start = async (...tables: string[]) => {
    declare(...tables)
    const resolved = sqliteProject()
    await generate(resolved)
    await migrateAndCodegen(resolved)
    return resolved
  }

  test('a dropped column is listed and nothing is written without approval', async () => {
    const resolved = await start(USER_COLUMNS(`legacy_flag: { type: 'text' },`))
    const before = migrations('sqlite')

    declare(USER_COLUMNS(''))
    const { written, refusals, destructive } = await generate(resolved)
    assert.deepEqual(written, [])
    assert.deepEqual(refusals, [])
    assert.deepEqual(
      destructive.map((d) => d.what),
      ['DROP COLUMN note.legacy_flag: its data is lost']
    )
    assert.deepEqual(migrations('sqlite'), before)
    const drift = await computeDeclaredTablesDrift(resolved)
    assert.equal(drift.pending, true)
    assert.deepEqual(drift.destructive, [
      'DROP COLUMN note.legacy_flag: its data is lost',
    ])
  })

  test('approved, it is written marked, migrate stops on it, and rows survive', async () => {
    const resolved = await start(USER_COLUMNS(`legacy_flag: { type: 'text' },`))
    await sqliteRun(
      resolved,
      `INSERT INTO note (id, title, legacy_flag) VALUES ('1', 'keep me', 'x')`
    )

    declare(USER_COLUMNS(''))
    const { written, refusals } = await generate(resolved, {
      allowDestructive: true,
    })
    assert.deepEqual(refusals, [])
    assert.equal(written.length, 1)
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.deepEqual(destructiveReasons(sql), [
      'DROP COLUMN note.legacy_flag: its data is lost',
    ])

    await assert.rejects(
      migrateAndCodegen(resolved),
      (e: Error) => e instanceof MigrationDestructiveError
    )
    await migrateAndCodegen(resolved, { allowDestructive: true })
    assert.deepEqual(await sqliteRows(resolved, 'SELECT id, title FROM note'), [
      { id: '1', title: 'keep me' },
    ])
    assert.equal((await generate(resolved)).written.length, 0)
    assert.equal((await computeDeclaredTablesDrift(resolved)).pending, false)
  })

  test('a column an index names is dropped with the index', async () => {
    const resolved = await start(
      USER_COLUMNS(`code: { type: 'text', index: true },`)
    )
    declare(USER_COLUMNS(''))
    const { written, refusals } = await generate(resolved, {
      allowDestructive: true,
    })
    assert.deepEqual(refusals, [])
    assert.match(
      readFileSync(written[0]!.file, 'utf8'),
      /DROP INDEX "[^"]+";\nALTER TABLE "note" DROP COLUMN "code";/
    )
    await migrateAndCodegen(resolved, { allowDestructive: true })
    assert.deepEqual(
      await sqliteRows(resolved, `PRAGMA table_info('note')`).then((r) =>
        r.map((c) => c.name)
      ),
      ['id', 'title']
    )
  })

  test('a column sqlite cannot drop is refused even when approved', async () => {
    const resolved = await start(
      USER_COLUMNS(`code: { type: 'text', unique: true },`)
    )
    const before = migrations('sqlite')
    declare(USER_COLUMNS(''))
    const { written, refusals } = await generate(resolved, {
      allowDestructive: true,
    })
    assert.deepEqual(written, [])
    assert.match(refusals[0]!, /does not apply on top of the existing ones/)
    assert.deepEqual(migrations('sqlite'), before)
  })

  test('a table that left the declaration is dropped only when approved', async () => {
    const resolved = await start(
      USER_COLUMNS(''),
      `tag: { columns: { id: { type: 'key', primaryKey: true } } }`
    )
    declare(USER_COLUMNS(''))
    const listed = await generate(resolved)
    assert.deepEqual(listed.written, [])
    assert.deepEqual(
      listed.destructive.map((d) => d.what),
      ['DROP TABLE tag: its rows are lost']
    )

    const { written, refusals } = await generate(resolved, {
      allowDestructive: true,
    })
    assert.deepEqual(refusals, [])
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.match(
      sql,
      /-- pikku:destructive DROP TABLE tag[^\n]*\nDROP TABLE "tag";/
    )
    assert.doesNotMatch(sql, /cascade/i)
    await assert.rejects(
      migrateAndCodegen(resolved),
      (e: Error) => e instanceof MigrationDestructiveError
    )
    await migrateAndCodegen(resolved, { allowDestructive: true })
    assert.deepEqual(
      await sqliteRows(
        resolved,
        `SELECT name FROM sqlite_master WHERE name = 'tag'`
      ),
      []
    )
  })

  test('a table the declaration never named is never dropped', async () => {
    handWritten('sqlite', 'CREATE TABLE legacy (id INTEGER PRIMARY KEY);')
    declare(USER_COLUMNS(''))
    const resolved = sqliteProject()
    const result = await generate(resolved, { allowDestructive: true })
    assert.deepEqual(result.destructive, [])
    assert.ok(
      !result.written.some((w) => /DROP/.test(readFileSync(w.file, 'utf8')))
    )
  })

  test('a type change and NOT NULL on an existing column stay refused', async () => {
    const resolved = await start(USER_COLUMNS(`qty: { type: 'integer' },`))
    declare(USER_COLUMNS(`qty: { type: 'text' },`))
    const type = await generate(resolved, { allowDestructive: true })
    assert.deepEqual(type.written, [])
    assert.match(
      type.refusals[0]!,
      /note\.qty differs from the migrations: type is/
    )

    declare(USER_COLUMNS(`qty: { type: 'integer', required: true },`))
    const required = await generate(resolved, { allowDestructive: true })
    assert.deepEqual(required.written, [])
    assert.match(required.refusals[0]!, /it became NOT NULL/)
  })

  test('additions and drops go in separate files, additions first', async () => {
    const resolved = await start(USER_COLUMNS(`legacy_flag: { type: 'text' },`))
    declare(USER_COLUMNS(`fresh: { type: 'text' },`))
    const { written } = await generate(resolved, { allowDestructive: true })
    assert.equal(written.length, 2)
    const [additive, drop] = written.map((w) => readFileSync(w.file, 'utf8'))
    assert.deepEqual(destructiveReasons(additive!), [])
    assert.match(additive!, /ADD COLUMN "fresh"/)
    assert.equal(destructiveReasons(drop!).length, 1)
    assert.ok(written[0]!.file < written[1]!.file)
  })
})

describe('destructive changes on postgres', () => {
  test('a table another table points at cannot be dropped, and the refusal says so', async () => {
    declare(`parent: { columns: { id: { type: 'key', primaryKey: true } } }`)
    const resolved = postgresProject()
    await generate(resolved)
    writeFileSync(
      join(migrationDir('postgres'), '0099-child.sql'),
      'CREATE TABLE child (id text PRIMARY KEY, parent_id text REFERENCES parent (id));\n'
    )
    declare(ITEM)
    const before = migrations('postgres')
    const { written, refusals } = await generate(resolved, {
      allowDestructive: true,
    })
    assert.deepEqual(
      written.filter((w) => /DROP/.test(readFileSync(w.file, 'utf8'))),
      []
    )
    assert.match(refusals[0]!, /does not apply on top of the existing ones/)
    assert.match(refusals[0]!, /a person writes that step/)
    assert.equal(migrations('postgres').length, before.length)
  })
})

describe('declared tables on postgres', () => {
  test('writes, adds a column and refuses a drop', async () => {
    declare(ITEM)
    const resolved = postgresProject()
    const first = await generate(resolved)
    assert.deepEqual(first.refusals, [])
    assert.match(
      readFileSync(first.written[0]!.file, 'utf8'),
      /create table "item"/
    )

    declare(item(`qty: { type: 'integer', default: 0 },`))
    const second = await generate(resolved)
    assert.deepEqual(second.refusals, [])
    assert.match(
      readFileSync(second.written[0]!.file, 'utf8'),
      /ALTER TABLE "item" ADD COLUMN "qty" integer default 0;/
    )
    assert.equal((await computeDeclaredTablesDrift(resolved)).pending, false)

    declare(ITEM)
    const third = await generate(resolved)
    assert.deepEqual(third.written, [])
    assert.deepEqual(
      third.destructive.map((d) => d.what),
      ['DROP COLUMN item.qty: its data is lost']
    )
    const approved = await generate(resolved, { allowDestructive: true })
    assert.deepEqual(approved.refusals, [])
    assert.match(
      readFileSync(approved.written[0]!.file, 'utf8'),
      /-- pikku:destructive DROP COLUMN item\.qty[^\n]*\nALTER TABLE "item" DROP COLUMN "qty";/
    )
  })

  test('adds a table-level constraint with its column', async () => {
    declare(ITEM)
    const resolved = postgresProject()
    await generate(resolved)
    declare(
      item(
        `code: { type: 'text' },`,
        `unique: [{ columns: ['code'], name: 'item_code_unique' }]`
      )
    )
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    assert.match(
      readFileSync(written[0]!.file, 'utf8'),
      /ALTER TABLE "item" ADD constraint "item_code_unique" unique \("code"\);/
    )
  })

  test('qualifies into db.schema, new tables and added columns alike', async () => {
    handWritten('postgres', 'CREATE SCHEMA app;')
    declare(ITEM)
    const resolved = postgresProject('app')
    const first = await generate(resolved)
    assert.deepEqual(first.refusals, [])
    assert.match(
      readFileSync(first.written[0]!.file, 'utf8'),
      /create table "app"\."item"/
    )
    declare(item(`note: { type: 'text' },`))
    const second = await generate(resolved)
    assert.deepEqual(second.refusals, [])
    assert.match(
      readFileSync(second.written[0]!.file, 'utf8'),
      /ALTER TABLE "app"\."item" ADD COLUMN "note" text;/
    )
  })

  test('a reference outside the declaration takes the type the migrations gave it', async () => {
    handWritten('postgres', 'CREATE TABLE account (id uuid PRIMARY KEY);')
    declare(item(`accountId: { references: 'account.id' },`))
    const { written, refusals } = await generate(postgresProject())
    assert.deepEqual(refusals, [])
    assert.match(
      readFileSync(written[0]!.file, 'utf8'),
      /"account_id" uuid references "account" \("id"\)/
    )
  })
})

describe('constraints on the declaration', () => {
  const CONSTRAINED = item(`
    status: { type: 'text', required: true, default: 'draft', enum: ['draft', 'sent'] },
    qty: { type: 'integer', min: 0, max: 99 },
    slug: { type: 'string(16)', minLength: 2, maxLength: 16, pattern: '^[a-z-]+$', format: 'email' },
    ratio: { type: 'real', min: 0.5 },`)

  test('a new table gets named checks, and the sidecar, types and zod carry them', async () => {
    declare(CONSTRAINED)
    const resolved = sqliteProject()
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.doesNotMatch(sql, /check/i, 'sqlite gets no CHECK')
    assert.doesNotMatch(sql, /a-z/, 'pattern never reaches SQL')

    await migrateAndCodegen(resolved, { scratch: true })
    const sidecar = JSON.parse(
      readFileSync(join(root, 'db', 'annotations.gen.json'), 'utf8')
    )
    assert.deepEqual(sidecar.item.qty, { min: 0, max: 99 })
    assert.deepEqual(sidecar.item.status, { enum: ['draft', 'sent'] })
    assert.equal(sidecar.item.slug.pattern, '^[a-z-]+$')

    const schema = readFileSync(
      join(root, '.pikku', 'db', 'schema.gen.ts'),
      'utf8'
    )
    assert.match(schema, /'draft' \| 'sent'/)
    // sqlite holds no CHECK for it, so the enums module has only the declaration to go on.
    assert.match(
      readFileSync(join(root, '.pikku', 'db', 'enums.gen.ts'), 'utf8'),
      /export type ItemStatus = 'draft' \| 'sent'/
    )
    const zod = readFileSync(join(root, '.pikku', 'db', 'zod.gen.ts'), 'utf8')
    assert.match(zod, /status: z\.enum\(\['draft', 'sent'\]\)/)
    assert.match(
      zod,
      /qty: z\.number\(\)\.int\(\)\.min\(0\)\.max\(99\)\.nullable\(\)/
    )
    assert.match(
      zod,
      /slug: z\.email\(\)\.min\(2\)\.max\(16\)\.regex\(new RegExp\("\^\[a-z-\]\+\$"\)\)\.nullable\(\)/
    )
    assert.match(zod, /ratio: z\.number\(\)\.min\(0\.5\)\.nullable\(\)/)
  })

  test('running it twice writes nothing the second time', async () => {
    declare(CONSTRAINED)
    const resolved = sqliteProject()
    await generate(resolved)
    const again = await generate(resolved)
    assert.deepEqual(again.refusals, [])
    assert.deepEqual(again.written, [])
  })

  test('sqlite: generate, migrate, codegen and drift all agree when only constraints are declared', async () => {
    declare(
      item(`status: { type: 'text', enum: ['draft', 'sent'] },
        qty: { type: 'integer', min: 0, max: 9 },
        slug: { type: 'string(16)', maxLength: 16 },`)
    )
    const resolved = sqliteProject()
    const { refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    await migrateAndCodegen(resolved)
    const drift = await computeDeclaredTablesDrift(resolved)
    assert.deepEqual([drift.pending, drift.refusals], [false, []])
    assert.deepEqual((await generate(resolved)).written, [])
    // a constraint changed, and a constrained column added, on the existing table
    declare(
      item(`status: { type: 'text', enum: ['draft', 'sent', 'void'] },
        qty: { type: 'integer', min: 0, max: 99 },
        slug: { type: 'string(16)', maxLength: 8 },
        kind: { type: 'text', enum: ['a', 'b'] },`)
    )
    const added = await generate(resolved)
    assert.deepEqual(added.refusals, [])
    await migrateAndCodegen(resolved)
    const after = await computeDeclaredTablesDrift(resolved)
    assert.deepEqual([after.pending, after.refusals], [false, []])
  })

  test('a column that is new on postgres gets its check with ADD COLUMN', async () => {
    declare(ITEM)
    const resolved = postgresProject()
    await generate(resolved)
    declare(item(`qty: { type: 'integer', min: 0 },`))
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    assert.match(
      readFileSync(written[0]!.file, 'utf8'),
      /ADD COLUMN "qty" integer constraint "item_qty_eff50b35_min_check" check \("qty" >= 0\);/
    )
    assert.deepEqual((await generate(resolved)).refusals, [])
  })

  test('sqlite writes no CHECK for a new or changed constraint, and says so once', async () => {
    declare(ITEM)
    const resolved = sqliteProject()
    await generate(resolved)
    await migrateAndCodegen(resolved)
    declare(
      item(`qty: { type: 'integer', min: 0 },
        kind: { type: 'text', enum: ['x', 'y'] },`)
    )
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.match(sql, /ADD COLUMN "qty" integer;/)
    assert.doesNotMatch(sql, /check/i)
    await migrateAndCodegen(resolved)

    // Tightening an existing column is not a migration on sqlite either.
    declare(
      item(`qty: { type: 'integer', min: 5, max: 9 },
        kind: { type: 'text', enum: ['x', 'y'] },`)
    )
    const again = await generate(resolved)
    assert.deepEqual([again.written, again.refusals], [[], []])

    const notice = (await declaredSqliteConstraintNotice(resolved))!
    assert.match(notice, /not enforced by the database on SQLite/)
    assert.match(notice, /item\.qty: min 5/)
    assert.match(notice, /item\.qty: CHECK \("qty" >= 5\)/)
    assert.match(notice, /item\.kind: CHECK \("kind" IN \('x', 'y'\)\)/)
    assert.match(notice, /Postgres or MySQL/)
    assert.match(notice, /db-sqlite-unenforced-constraints/)
    assert.equal(
      await declaredSqliteConstraintNotice(
        resolveDb(
          { postgresUrl: 'postgres://localhost/none' },
          root,
          join(root, '.pikku')
        )!
      ),
      undefined
    )
  })

  describe('the sqlite notice leaves out what the migrations already enforce', () => {
    const QTY_KIND = `qty: { type: 'integer', min: 0 },
        kind: { type: 'text', enum: ['x', 'y'] },`

    /** A table with qty and kind that the generated migrations created without checks. */
    const withoutChecks = async () => {
      declare(item(QTY_KIND))
      const resolved = sqliteProject()
      await generate(resolved)
      await migrateAndCodegen(resolved)
      return resolved
    }

    /** What the notice's own option 2 asks for: a hand-written migration rebuilding the table with the checks. */
    const rebuild = (resolved: ResolvedDb, checks: Record<string, string>) => {
      const dir = resolved.migrationsDir
      const files = readdirSync(dir).sort()
      const last = files[files.length - 1]!
      const next = String(Number(/^(\d+)/.exec(last)![1]) + 1).padStart(
        /^(\d+)/.exec(last)![1]!.length,
        '0'
      )
      writeFileSync(
        join(dir, `${next}-add-checks.sql`),
        `CREATE TABLE "item_new" ("id" text PRIMARY KEY, "name" text NOT NULL, "qty" integer ${checks.qty ?? ''}, "kind" text ${checks.kind ?? ''});
INSERT INTO "item_new" SELECT "id", "name", "qty", "kind" FROM "item";
DROP TABLE "item";
ALTER TABLE "item_new" RENAME TO "item";
`
      )
    }

    test('lists every declared constraint when none is enforced', async () => {
      const notice = (await declaredSqliteConstraintNotice(
        await withoutChecks()
      ))!
      assert.match(notice, /item\.qty: min 0/)
      assert.match(notice, /item\.kind: one of x, y/)
    })

    test('a matching hand-written check is not listed, the unmatched ones still are', async () => {
      const resolved = await withoutChecks()
      rebuild(resolved, { kind: `CHECK (kind IN ('x','y'))` })
      const notice = (await declaredSqliteConstraintNotice(resolved))!
      assert.doesNotMatch(notice, /item\.kind/)
      assert.match(notice, /item\.qty: min 0/)
      assert.match(notice, /item\.qty: CHECK \("qty" >= 0\)/)
    })

    test('following the notice (rebuild with the suggested CHECKs) silences it', async () => {
      const resolved = await withoutChecks()
      rebuild(resolved, {
        qty: `CHECK ("qty" >= 0)`,
        kind: `CHECK ("kind" IN ('x', 'y'))`,
      })
      assert.equal(await declaredSqliteConstraintNotice(resolved), undefined)
    })

    test('a check that differs from the declaration still gets the notice', async () => {
      const resolved = await withoutChecks()
      rebuild(resolved, {
        qty: `CHECK ("qty" >= 1)`,
        kind: `CHECK ("kind" IN ('x', 'y', 'z'))`,
      })
      const notice = (await declaredSqliteConstraintNotice(resolved))!
      assert.match(notice, /item\.qty: min 0/)
      assert.match(notice, /item\.kind: one of x, y/)
    })
  })

  describe('postgres alters constraints in place', () => {
    const NAME_ONLY = `item: { columns: {
        id: { type: 'key', primaryKey: true },
        name: { type: 'text', required: true },
      } }`
    const bounded = (n: number) => `item: { columns: {
        id: { type: 'key', primaryKey: true },
        name: { type: 'text', required: true, maxLength: ${n} },
      } }`

    test('adding one is NOT VALID, then VALIDATE, with a probe above it', async () => {
      declare(NAME_ONLY)
      const resolved = postgresProject()
      await generate(resolved)
      declare(bounded(20))
      const { written, refusals } = await generate(resolved)
      assert.deepEqual(refusals, [])
      const sql = readFileSync(written[0]!.file, 'utf8')
      assert.match(
        sql,
        /-- pikku:check-probe \{"table":"item","sql":"SELECT 1 FROM \\"item\\" WHERE NOT \(.*length.*<= 20\) LIMIT 1"\}\nALTER TABLE "item" ADD CONSTRAINT "item_name_cfa0169f_maxlength_check" CHECK \(.*\) NOT VALID;/
      )
      assert.match(
        sql,
        /ALTER TABLE "item" VALIDATE CONSTRAINT "item_name_cfa0169f_maxlength_check";/
      )
      assert.deepEqual((await generate(resolved)).written, [])
    })

    test('changing one drops and re-adds it, removing one drops it', async () => {
      declare(bounded(20))
      const resolved = postgresProject()
      await generate(resolved)

      declare(bounded(30))
      const changed = await generate(resolved)
      assert.deepEqual(changed.refusals, [])
      const sql = readFileSync(changed.written[0]!.file, 'utf8')
      assert.match(
        sql,
        /DROP CONSTRAINT "item_name_cfa0169f_maxlength_check";[\s\S]*ADD CONSTRAINT "item_name_cfa0169f_maxlength_check" CHECK \(.*30\) NOT VALID;/
      )
      assert.deepEqual((await generate(resolved)).written, [])

      declare(NAME_ONLY)
      const removed = await generate(resolved)
      assert.deepEqual(removed.refusals, [])
      assert.match(
        readFileSync(removed.written[0]!.file, 'utf8'),
        /ALTER TABLE "item" DROP CONSTRAINT "item_name_cfa0169f_maxlength_check";/
      )
      assert.deepEqual((await generate(resolved)).written, [])
    })

    test('a schema qualifies every statement', async () => {
      handWritten('postgres', 'CREATE SCHEMA app;')
      declare(NAME_ONLY)
      const resolved = postgresProject('app')
      await generate(resolved)
      declare(bounded(20))
      const { written } = await generate(resolved)
      assert.match(
        readFileSync(written[0]!.file, 'utf8'),
        /ALTER TABLE "app"."item" ADD CONSTRAINT .* NOT VALID;[\s\S]*ALTER TABLE "app"."item" VALIDATE CONSTRAINT/
      )
    })
  })

  test('a check a person wrote by hand, under any name, satisfies the declaration', async () => {
    handWritten(
      'sqlite',
      `CREATE TABLE item (id TEXT PRIMARY KEY, qty INTEGER CONSTRAINT my_rule CHECK (qty >= 0), n INTEGER CHECK (n <= 5));`
    )
    declare(`item: { columns: {
      id: { type: 'text', primaryKey: true },
      qty: { type: 'integer', min: 0 },
      n: { type: 'integer', max: 5 },
    } }`)
    const { refusals } = await generate(sqliteProject())
    assert.deepEqual(refusals, [])
  })

  test('a hand-written check the declaration does not mention is left alone', async () => {
    handWritten(
      'sqlite',
      `CREATE TABLE item (id TEXT PRIMARY KEY, qty INTEGER CONSTRAINT my_rule CHECK (qty >= 0));`
    )
    declare(`item: { columns: {
      id: { type: 'text', primaryKey: true },
      qty: { type: 'integer' },
    } }`)
    assert.deepEqual((await generate(sqliteProject())).refusals, [])
  })

  test('a constraint the column type cannot hold is an error naming the column', async () => {
    declare(item(`flag: { type: 'boolean', min: 1 },`))
    await assert.rejects(
      generate(sqliteProject()),
      /'item\.flag' is boolean, so it cannot have a min or max/
    )
  })

  test('on a declareOnly table they type the column and are not generated', async () => {
    handWritten(
      'sqlite',
      `CREATE TABLE item (id TEXT PRIMARY KEY, kind TEXT, n INTEGER);`
    )
    declare(`item: { declareOnly: true, columns: {
      id: { type: 'text', primaryKey: true },
      kind: { type: 'text', enum: ['a', 'b'] },
      n: { type: 'integer', min: 1 },
    } }`)
    const resolved = sqliteProject()
    const { written, refusals } = await generate(resolved)
    assert.deepEqual([written, refusals], [[], []])
    await migrateAndCodegen(resolved, { scratch: true })
    assert.match(
      readFileSync(join(root, '.pikku', 'db', 'schema.gen.ts'), 'utf8'),
      /'a' \| 'b'/
    )
    assert.match(
      readFileSync(join(root, '.pikku', 'db', 'zod.gen.ts'), 'utf8'),
      /n: z\.number\(\)\.int\(\)\.min\(1\)\.nullable\(\)/
    )
  })
})

describe('database context', () => {
  test('says where tables are declared, and not where migrations live', async () => {
    declare(ITEM)
    const context = await databaseContext({
      rootDir: root,
      outDir: join(root, '.pikku'),
      srcDirectories: ['src'],
    })
    assert.equal(context.tables.file, 'db/tables.ts')
    assert.equal(context.tables.exists, true)
    assert.deepEqual(context.tables.declared, ['item'])
    assert.deepEqual(context.tables.declareOnly, [])
    assert.equal(context.types.schema, join('.pikku', 'db', 'schema.gen.ts'))
    assert.match(context.workflow.join('\n'), /pikku db generate/)
    assert.doesNotMatch(JSON.stringify(context), /db\/(sqlite|postgres|mysql)/)
  })

  test('lists declareOnly tables apart from the generated ones', async () => {
    declare(
      ITEM,
      `userProfile: { declareOnly: true, columns: { id: { type: 'key' } } }`
    )
    const context = await databaseContext({
      rootDir: root,
      outDir: join(root, '.pikku'),
      srcDirectories: ['src'],
    })
    assert.deepEqual(context.tables.declared, ['item'])
    assert.deepEqual(context.tables.declareOnly, ['user_profile'])
    assert.match(context.workflow.join('\n'), /@pikku\/core\/db/)
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

describe('a MySQL-protocol server that cannot take a CHECK', () => {
  const resolved = () =>
    resolveDb(
      { mysqlUrl: 'mysql://u:p@127.0.0.1:1/never_reached' },
      root,
      join(root, '.pikku')
    )!

  test('MariaDB is refused first, before anything is run against the server', async () => {
    declare(item(`qty: { type: 'integer', min: 0 },`))
    const plan = await planDeclaredTables(resolved(), [], {
      serverVersion: async () => '11.4.2-MariaDB-ubu2404',
    })
    assert.deepEqual(plan!.bodies, [])
    assert.equal(plan!.refusals.length, 1)
    assert.match(plan!.refusals[0]!, /MariaDB is not supported/)
    assert.match(plan!.refusals[0]!, /item\.qty: min 0/)
  })

  test('a MySQL older than 8.0.16 is refused the same way, with its own reason', async () => {
    declare(item(`qty: { type: 'integer', min: 0 },`))
    const plan = await planDeclaredTables(resolved(), [], {
      serverVersion: async () => '8.0.15',
    })
    assert.match(plan!.refusals.join(), /older than 8\.0\.16/)
  })

  test('a declaration with no constraints is not refused for the server', async () => {
    declare(ITEM)
    // The server is never reached for the version; materializing would need one,
    // so this only proves the refusal is not raised.
    await assert.rejects(
      planDeclaredTables(resolved(), [], {
        serverVersion: async () => '11.4.2-MariaDB',
      })
    )
  })
})
