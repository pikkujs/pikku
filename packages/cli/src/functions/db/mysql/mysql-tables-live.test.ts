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

  test('refuses a dropped column', async () => {
    declare(ITEM)
    const { written, refusals } = await generate()
    assert.deepEqual(written, [])
    assert.match(refusals[0]!, /item\.code is in the migrations/)
  })
})
