import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  baseline,
  computeSchemaDrift,
  createKysely,
  migrateAndCodegen,
  resolveDb,
  type ResolvedMysqlDb,
} from '../local-db.js'
import { withMysqlClient } from './mysql-client.js'

/**
 * A mysqldump of a Rails database — backticks, version-comment directives,
 * ENGINE/COLLATE clauses, bigint AUTO_INCREMENT, tinyint(1), json, a foreign key
 * that points at a table the dump has not created yet — as the one migration of
 * a project moving onto pikku. Needs PIKKU_TEST_MYSQL_URL, as mysql-live does.
 */
const SERVER_URL = process.env.PIKKU_TEST_MYSQL_URL
const DUMP = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/rails-dump.sql'
)

const urlFor = (database: string) => {
  const url = new URL(SERVER_URL!)
  url.pathname = `/${database}`
  return url.toString()
}

describe('a mysqldump as the first migration', { skip: !SERVER_URL }, () => {
  let root: string
  let database: string
  let resolved: ResolvedMysqlDb
  const admin = { connectionString: SERVER_URL! } as ResolvedMysqlDb

  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'pikku-mysql-dump-'))
    database = `pikku_t_${randomBytes(5).toString('hex')}`
    await withMysqlClient(admin, (c) =>
      c.exec(`CREATE DATABASE \`${database}\``)
    )
    mkdirSync(join(root, 'db/mysql'), { recursive: true })
    copyFileSync(DUMP, join(root, 'db/mysql/0001-rails-baseline.sql'))
    resolved = resolveDb(
      { mysqlUrl: urlFor(database) },
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

  test('baseline records the dump on a database pikku did not create, without running it', async () => {
    // The tables exist already, created by something else (Rails).
    await withMysqlClient(resolved, (c) => c.exec(readFileSync(DUMP, 'utf8')))
    await withMysqlClient(resolved, async (c) => {
      await c.exec(`UPDATE invoices SET number = 'untouched'`)
    })
    const result = await baseline(resolved, root, [], { error() {} })
    assert.deepEqual(result, {
      status: 'recorded',
      recorded: ['0001-rails-baseline.sql'],
    })
    // Nothing was executed: the dump's DROP TABLE would have emptied the table.
    await withMysqlClient(resolved, async (c) => {
      const { rows } = await c.query<{ number: string }>(
        'SELECT number FROM invoices'
      )
      assert.deepEqual(rows, [{ number: 'untouched' }])
    })
    const drift = await computeSchemaDrift(resolved, root, [], { error() {} })
    assert.equal(drift.inSync, true)
    assert.deepEqual(drift.extraTables, [])
  })

  test('db codegen introspects the existing tables into Kysely types', async () => {
    const outcome = await migrateAndCodegen(resolved, { scratch: true })
    assert.deepEqual(outcome.migrate.applied, ['0001-rails-baseline.sql'])
    const schema = readFileSync(resolved.schemaFile, 'utf8')
    assert.match(schema, /interface Invoices \{/)
    assert.match(schema, /interface InvoiceLines \{/)
    assert.match(schema, /paid: ColumnType<Private<boolean>/)
    assert.match(schema, /issuedAt: ColumnType<Private<Date> \| null/)
    assert.match(
      schema,
      /dueOn: ColumnType<Private<Date> \| null|dueOn:[^\n]*(string|Date)/
    )
    assert.match(schema, /meta: ColumnType<Private<unknown> \| null/)
    assert.match(
      schema,
      /status: ColumnType<Private<'open' \| 'paid' \| 'void'>/
    )
    assert.match(schema, /invoiceId: ColumnType<Private<(string|number)>,/)
  })

  test('the bigint id, tinyint(1) and decimal read back the way the types say', async () => {
    await migrateAndCodegen(resolved, { scratch: true })
    const db = await createKysely<any>(resolved)
    try {
      await db
        .insertInto('invoiceLines')
        .values({ invoiceId: 1, amount: 12.5 })
        .execute()
      const invoice = await db
        .selectFrom('invoices')
        .select(['id', 'paid', 'issuedAt', 'meta'])
        .executeTakeFirstOrThrow()
      assert.equal(invoice.id, 1)
      assert.equal(invoice.paid, true)
      assert.ok(invoice.issuedAt instanceof Date)
      assert.deepEqual(invoice.meta, { a: 1 })
      const line = await db
        .selectFrom('invoiceLines')
        .select(['id', 'amount'])
        .executeTakeFirstOrThrow()
      assert.equal(typeof line.id, 'number')
      assert.equal(line.amount, 12.5)
    } finally {
      await db.destroy()
    }
  })
})
