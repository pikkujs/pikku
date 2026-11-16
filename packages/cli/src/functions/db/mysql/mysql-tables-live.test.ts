import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
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
  resolveDb,
  type ResolvedMysqlDb,
} from '../local-db.js'
import { withMysqlClient } from './mysql-client.js'

/**
 * Declared tables against a real server: the generated SQL has to apply through
 * MySQL's own parser, and the rehearsal only proves that here.
 *
 * Needs PIKKU_TEST_MYSQL_URL, as mysql-live does.
 */
const SERVER_URL = process.env.PIKKU_TEST_MYSQL_URL

const ITEM_COLUMNS = `id: { type: 'key', primaryKey: true },
      name: { type: 'text', required: true },`
const ITEM = `item: { columns: { ${ITEM_COLUMNS} } }`

describe('declared tables on mysql', { skip: !SERVER_URL }, () => {
  let root: string
  let database: string
  let resolved: ResolvedMysqlDb
  let version = 0
  const admin = { connectionString: SERVER_URL! } as ResolvedMysqlDb

  const declare = (tables: string) => {
    const file = join(root, 'db', 'tables.ts')
    writeFileSync(file, `export const tables = { ${tables} }\n`)
    const at = new Date(Date.now() + ++version * 1000)
    utimesSync(file, at, at)
  }

  const generate = async () => {
    const result = await generateMigrations(
      resolved,
      root,
      ['src'],
      { error: (message) => assert.fail(message) },
      [],
      new Set()
    )
    return {
      ...result,
      written: result.written.filter((w) => w.source === 'app-tables'),
    }
  }

  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'pikku-tables-mysql-'))
    mkdirSync(join(root, 'db', 'mysql'), { recursive: true })
    database = `pikku_t_${randomBytes(5).toString('hex')}`
    await withMysqlClient(admin, (c) =>
      c.exec(`CREATE DATABASE \`${database}\``)
    )
    const url = new URL(SERVER_URL!)
    url.pathname = `/${database}`
    resolved = resolveDb(
      { mysqlUrl: url.toString() },
      root,
      join(root, '.pikku')
    ) as ResolvedMysqlDb
  })

  after(async () => {
    await withMysqlClient(admin, (c) =>
      c.exec(`DROP DATABASE IF EXISTS \`${database}\``)
    )
    rmSync(root, { recursive: true, force: true })
  })

  test('writes a table, then adds a column and a constraint', async () => {
    declare(ITEM)
    const first = await generate()
    assert.deepEqual(first.refusals, [])
    assert.match(
      readFileSync(first.written[0]!.file, 'utf8'),
      /create table `item`/
    )

    declare(`item: {
      columns: { ${ITEM_COLUMNS} code: { type: 'string(32)' } },
      unique: [{ columns: ['code'], name: 'item_code_unique' }],
    }`)
    const second = await generate()
    assert.deepEqual(second.refusals, [])
    const sql = readFileSync(second.written[0]!.file, 'utf8')
    assert.match(sql, /ALTER TABLE `item` ADD COLUMN `code` varchar\(32\);/)
    assert.match(sql, /ALTER TABLE `item` ADD constraint `item_code_unique`/)

    assert.deepEqual((await generate()).written, [])
  })

  test('lists a dropped column and writes nothing without approval', async () => {
    declare(ITEM)
    const { written, refusals, destructive } = await generate()
    assert.deepEqual(written, [])
    assert.deepEqual(refusals, [])
    assert.match(destructive[0]!.what, /DROP COLUMN item\.code/)
  })

  const KEEP = `item: { columns: { ${ITEM_COLUMNS} code: { type: 'string(32)' } }, unique: [{ columns: ['code'], name: 'item_code_unique' }] }`
  const PARENT = `parent: { columns: { id: { type: 'key', primaryKey: true } } }`
  const CHILD = `child: { columns: { id: { type: 'key', primaryKey: true }, parentId: { type: 'key', references: 'parent.id' } } }`
  const SHEET = (column: string) =>
    `sheet: { columns: { id: { type: 'key', primaryKey: true }, ${column} } }`

  const generateApproved = () =>
    generateMigrations(
      resolved,
      root,
      ['src'],
      { error: (message) => assert.fail(message) },
      [],
      new Set(),
      { allowDestructive: true }
    )

  test('refuses to drop a table another table still points at', async () => {
    declare(`${KEEP}, ${PARENT}, ${CHILD}`)
    assert.deepEqual((await generate()).refusals, [])

    // The migrator runs with FOREIGN_KEY_CHECKS off, which would let it through.
    declare(`${KEEP}, ${CHILD}`)
    const approved = await generateApproved()
    assert.deepEqual(approved.written, [])
    assert.match(
      approved.refusals.join(),
      /child still has a foreign key to parent/
    )
  })

  test('a rename that tightens an enum asks the rows before the old bound goes', async () => {
    declare(
      `${KEEP}, ${PARENT}, ${CHILD}, ${SHEET(`status: { type: 'text', enum: ['draft', 'sent'] }`)}`
    )
    assert.deepEqual((await generate()).refusals, [])

    declare(
      `${KEEP}, ${PARENT}, ${CHILD}, ${SHEET(`state: { type: 'text', enum: ['draft'], renamedFrom: 'status' }`)}`
    )
    const { written, refusals } = await generate()
    assert.deepEqual(refusals, [])
    const probes = readFileSync(written[0]!.file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('pikku:check-probe'))
    assert.equal(probes.length, 1)
    assert.match(probes[0]!, /`status`/)
    assert.doesNotMatch(probes[0]!, /`state`/)
  })
})
