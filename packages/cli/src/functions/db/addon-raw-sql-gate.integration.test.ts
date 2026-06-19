import { strict as assert } from 'assert'
import { describe, test, before, after } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import {
  checkRawSqlOwnership,
  discoverOwnedTables,
} from './addon-table-discovery.js'
import { checkForeignKeyClosure } from './addon-table-schema.js'

// Verifier for the raw-SQL ownership gate. Builds ONE project with several
// functions across two domains plus the two type-bypass forms, then:
//   1. carves two addons out of it (disjoint owned table sets),
//   2. shows the gate rejects the raw-SQL function and passes the typed ones,
//   3. proves WHY the gate is needed — raw SQL under-reports silently, whereas
//      `db.dynamic.table()` fails loud via a residual (so the gate skips it).
//
// Green here proves the GATE, not that `--filter` yields a buildable addon
// (service wiring / SQL emission / import-closure are still unwired).

const require = createRequire(import.meta.url)
const kyselyEntry = require.resolve('kysely')
const kyselyRoot = kyselyEntry.slice(
  0,
  kyselyEntry.indexOf(`${'/'}kysely${'/'}`) + '/kysely'.length
)

let dir: string
const file = (name: string) => join(dir, name)

const DB_TYPES = `export interface DB {
  customer: { id: string; email: string }
  charge: { id: string; customerId: string; cents: number }
  event: { id: string; kind: string }
  audit_log: { id: string; msg: string }
}
`

const SERVICES = `import type { Kysely } from 'kysely'
import type { AddonDB } from './addon-db.gen'
export interface Services { kysely: Kysely<AddonDB> }
`

// payments domain — owns charge + customer (via join + insert)
const PAYMENTS = `import type { Services } from './services'
export async function listCharges(services: Services) {
  await services.kysely
    .selectFrom('charge')
    .innerJoin('customer', 'customer.id', 'charge.customerId')
    .selectAll()
    .execute()
}
export async function createCharge(services: Services) {
  await services.kysely.insertInto('charge').values({} as any).execute()
}
`

// analytics domain — owns event only
const ANALYTICS = `import type { Services } from './services'
export async function listEvents(services: Services) {
  await services.kysely.selectFrom('event').selectAll().execute()
}
`

// raw SQL — references audit_log through a string the types never check
const AUDIT_RAW = `import { sql } from 'kysely'
import type { Services } from './services'
export async function tailAudit(services: Services) {
  await sql<{ id: string }>\`select id from audit_log\`.execute(services.kysely)
}
`

// dynamic.table — references audit_log through the dynamic module (type-checked)
const AUDIT_DYNAMIC = `import type { Services } from './services'
export async function tailAuditDyn(services: Services) {
  await services.kysely
    .selectFrom(services.kysely.dynamic.table('audit_log').as('a'))
    .selectAll()
    .execute()
}
`

const PAYMENTS_FILE = 'payments.function.ts'
const ANALYTICS_FILE = 'analytics.function.ts'
const AUDIT_RAW_FILE = 'audit-raw.function.ts'
const AUDIT_DYN_FILE = 'audit-dyn.function.ts'

const ALL_FN_FILES = [
  PAYMENTS_FILE,
  ANALYTICS_FILE,
  AUDIT_RAW_FILE,
  AUDIT_DYN_FILE,
]

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2021,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  baseUrl: '.',
  paths: {
    kysely: [join(kyselyRoot, 'dist/index.d.ts')],
    'kysely/*': [join(kyselyRoot, 'dist/*')],
  },
}

function writeAddonDb(owned: string[]): void {
  const pick =
    owned.length === 0
      ? 'Pick<DB, never>'
      : `Pick<DB, ${owned.map((t) => `'${t}'`).join(' | ')}>`
  writeFileSync(
    file('addon-db.gen.ts'),
    `import type { DB } from './db.types'\nexport type AddonDB = ${pick}\n`
  )
}

// Program over the whole project; the oracle is scoped to the bundled subset.
function buildProgram(owned: string[]): ts.Program {
  writeAddonDb(owned)
  return ts.createProgram(
    [
      ...ALL_FN_FILES.map(file),
      file('services.ts'),
      file('addon-db.gen.ts'),
      file('db.types.ts'),
    ],
    COMPILER_OPTIONS
  )
}

// Read a source file with parent pointers set, so the gate can walk it.
function sourceFor(name: string): ts.SourceFile {
  const program = buildProgram([])
  const sf = program.getSourceFile(file(name))
  assert.ok(sf, `missing source file ${name}`)
  return sf
}

describe('raw-SQL ownership gate (verifier, real kysely)', () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'pikku-addon-gate-'))
    writeFileSync(file('db.types.ts'), DB_TYPES)
    writeFileSync(file('services.ts'), SERVICES)
    writeFileSync(file(PAYMENTS_FILE), PAYMENTS)
    writeFileSync(file(ANALYTICS_FILE), ANALYTICS)
    writeFileSync(file(AUDIT_RAW_FILE), AUDIT_RAW)
    writeFileSync(file(AUDIT_DYN_FILE), AUDIT_DYNAMIC)
    writeAddonDb([])
  })

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('two addons carved from one project have disjoint owned sets', () => {
    const payments = discoverOwnedTables(
      buildProgram,
      new Set([file(PAYMENTS_FILE)])
    )
    const analytics = discoverOwnedTables(
      buildProgram,
      new Set([file(ANALYTICS_FILE)])
    )

    assert.deepEqual(payments.owned, ['charge', 'customer'])
    assert.equal(payments.residual.length, 0)
    assert.deepEqual(analytics.owned, ['event'])
    assert.equal(analytics.residual.length, 0)

    // disjoint — neither addon claims the other's tables
    for (const t of analytics.owned) assert.ok(!payments.owned.includes(t))

    // payments' charge->customer FK stays inside the owned set (closure ok)
    const fkErrors = checkForeignKeyClosure(
      [
        {
          name: 'charge',
          columns: [],
          foreignKeys: [
            { column: 'customerId', foreignTable: 'customer', foreignColumn: 'id' },
          ],
        },
      ],
      new Set(payments.owned)
    )
    assert.deepEqual(fkErrors, [])
  })

  test('gate rejects the raw-SQL function, passes the typed ones', () => {
    const typed = checkRawSqlOwnership([
      sourceFor(PAYMENTS_FILE),
      sourceFor(ANALYTICS_FILE),
    ])
    assert.deepEqual(typed, [])

    const gated = checkRawSqlOwnership([sourceFor(AUDIT_RAW_FILE)])
    assert.equal(gated.length, 1)
    assert.match(gated[0]!, /\[PKU-ADDON-RAWSQL\].*audit-raw\.function\.ts/)
  })

  test('evidence: raw SQL under-reports silently; dynamic.table fails loud', () => {
    // Raw SQL: audit_log is in neither owned nor residual — a SILENT miss the
    // gate exists to catch.
    const raw = discoverOwnedTables(buildProgram, new Set([file(AUDIT_RAW_FILE)]))
    assert.ok(!raw.owned.includes('audit_log'))
    assert.equal(raw.residual.length, 0)

    // dynamic.table: kysely type-checks the arg, so audit_log surfaces as a
    // LOUD residual — the residual gate handles it, no raw-SQL flag needed.
    const dyn = discoverOwnedTables(buildProgram, new Set([file(AUDIT_DYN_FILE)]))
    assert.ok(!dyn.owned.includes('audit_log'))
    assert.ok(dyn.residual.length > 0)
    assert.deepEqual(checkRawSqlOwnership([sourceFor(AUDIT_DYN_FILE)]), [])
  })
})
