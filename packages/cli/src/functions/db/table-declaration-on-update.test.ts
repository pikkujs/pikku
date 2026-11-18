import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generateMigrations,
  migrateAndCodegen,
  resolveDb,
  type ResolvedDb,
} from './local-db.js'
import {
  declareOnlyOnUpdateProblems,
  declaresOnUpdate,
} from './table-declaration.js'

let root: string
let version = 0
const logger = { error: (msg: string) => assert.fail(msg) }

const declare = (...tables: string[]) => {
  mkdirSync(join(root, 'db'), { recursive: true })
  const file = join(root, 'db', 'tables.ts')
  writeFileSync(file, `export const tables = {\n  ${tables.join(',\n  ')}\n}\n`)
  const at = new Date(Date.now() + ++version * 1000)
  utimesSync(file, at, at)
}

const generate = async (resolved: ResolvedDb) => {
  const result = await generateMigrations(
    resolved,
    root,
    ['src'],
    logger,
    [],
    new Set(),
    {}
  )
  return {
    ...result,
    written: result.written.filter(({ source }) => source === 'app-tables'),
  }
}

const sqliteProject = (): ResolvedDb =>
  resolveDb({ sqliteDb: 'dev.db' }, root, join(root, '.pikku'))!

const postgresProject = (): ResolvedDb => {
  mkdirSync(join(root, 'db', 'postgres'), { recursive: true })
  return resolveDb({}, root, join(root, '.pikku'))!
}

const handWritten = (dialect: string, sql: string) => {
  mkdirSync(join(root, 'db', dialect), { recursive: true })
  writeFileSync(join(root, 'db', dialect, '0001-init.sql'), sql)
}

const NOTE = `note: { columns: {
  id: { type: 'key', primaryKey: true },
  updatedAt: { type: 'timestamp', default: { now: true }, onUpdate: { now: true } },
} }`

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-on-update-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('onUpdate in generated migrations', () => {
  test('sqlite writes the trigger with the table and is up to date once applied', async () => {
    declare(NOTE)
    const resolved = sqliteProject()
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.match(sql, /create table "note"/)
    assert.match(
      sql,
      /create trigger "note_updated_at_on_update" after update on "note"/
    )
    assert.doesNotMatch(sql, /pikku_on_update/)

    await migrateAndCodegen(resolved, { scratch: true })
    assert.ok((await generate(resolved)).upToDate.includes('app-tables'))
  })

  test('postgres writes the shared function before the trigger', async () => {
    declare(NOTE)
    const resolved = postgresProject()
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    const sql = readFileSync(written[0]!.file, 'utf8')
    assert.ok(
      sql.indexOf('create or replace function "pikku_on_update"') <
        sql.indexOf(
          'create trigger "note_updated_at_on_update" before update on "note"'
        ),
      sql
    )
    assert.match(sql, /default now\(\)/)

    await migrateAndCodegen(resolved, { scratch: true })
    assert.ok((await generate(resolved)).upToDate.includes('app-tables'))
  })

  test('a column added later with onUpdate brings its trigger', async () => {
    declare(`note: { columns: { id: { type: 'key', primaryKey: true } } }`)
    const resolved = sqliteProject()
    await generate(resolved)
    await migrateAndCodegen(resolved, { scratch: true })

    declare(`note: { columns: {
      id: { type: 'key', primaryKey: true },
      touchedAt: { type: 'timestamp', onUpdate: { now: true } },
    } }`)
    const { written, refusals } = await generate(resolved)
    assert.deepEqual(refusals, [])
    const sql = readFileSync(written.at(-1)!.file, 'utf8')
    assert.match(sql, /alter table "note" add column "touched_at"/i)
    assert.match(sql, /create trigger "note_touched_at_on_update"/)
  })
})

describe('onUpdate on a declareOnly table', () => {
  const declared = `account: { declareOnly: true, columns: {
    id: { type: 'key', primaryKey: true },
    seenAt: { type: 'timestamp', onUpdate: { now: true } },
  } }`

  test('is refused until a migration provides the trigger', async () => {
    handWritten(
      'sqlite',
      'CREATE TABLE account (id TEXT PRIMARY KEY, seen_at TEXT);'
    )
    declare(declared)
    const { refusals } = await generate(sqliteProject())
    assert.equal(refusals.length, 1)
    assert.match(
      refusals[0]!,
      /declares onUpdate on account\.seen_at, but the migrations create no UPDATE trigger for it.*write that migration/
    )
  })

  test('is accepted when the migrations create it', async () => {
    handWritten(
      'sqlite',
      `CREATE TABLE account (id TEXT PRIMARY KEY, seen_at TEXT);
CREATE TRIGGER account_seen BEFORE UPDATE ON account BEGIN UPDATE account SET seen_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;`
    )
    declare(declared)
    const { refusals } = await generate(sqliteProject())
    assert.deepEqual(refusals, [])
  })
})

describe('declareOnlyOnUpdateProblems', () => {
  const tables = {
    t: {
      declareOnly: true,
      columns: { c: { onUpdate: { now: true } }, plain: {} },
    },
  } as never

  test('only columns that declare an onUpdate are checked', () => {
    assert.equal(declaresOnUpdate(tables), true)
    assert.equal(
      declaresOnUpdate({
        t: { declareOnly: true, columns: { c: {} } },
      } as never),
      false
    )
  })

  test('mysql looks for the attribute, the others for a trigger on the column', () => {
    const none = { triggers: [], attributes: new Set<string>() }
    assert.match(
      declareOnlyOnUpdateProblems(tables, none, 'mysql')[0]!,
      /ON UPDATE attribute/
    )
    assert.deepEqual(
      declareOnlyOnUpdateProblems(
        tables,
        { triggers: [], attributes: new Set(['t.c']) },
        'mysql'
      ),
      []
    )
    const elsewhere = {
      triggers: [
        { name: 'x', table: 'other', definition: 'before update (c)' },
      ],
      attributes: new Set<string>(),
    }
    assert.equal(
      declareOnlyOnUpdateProblems(tables, elsewhere, 'postgres').length,
      1
    )
    assert.deepEqual(
      declareOnlyOnUpdateProblems(
        tables,
        {
          triggers: [
            { name: 'x', table: 't', definition: 'BEFORE UPDATE ON t ... c' },
          ],
          attributes: new Set(),
        },
        'postgres'
      ),
      []
    )
  })
})
