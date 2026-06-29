import { strict as assert } from 'assert'
import { describe, test, before, after } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { discoverOwnedTables } from './addon-table-discovery.js'

// Exercises the compile-oracle against REAL kysely types — the automated form
// of the manual spike: empty owned set must error at every table reference and
// the fixpoint must recover exactly the used tables (no more, no less).
const require = createRequire(import.meta.url)
const kyselyEntry = require.resolve('kysely') // .../kysely/dist/index.js
const kyselyRoot = kyselyEntry.slice(
  0,
  kyselyEntry.indexOf(`${'/'}kysely${'/'}`) + '/kysely'.length
)

let dir: string
const file = (name: string) => join(dir, name)

const DB_TYPES = `export interface DB {
  organization: { id: string; name: string }
  project: { id: string; orgId: string; title: string }
  unused: { id: string; note: string }
}
`

const SERVICES = `import type { Kysely } from 'kysely'
import type { AddonDB } from './addon-db.gen'
export interface Services { kysely: Kysely<AddonDB> }
`

// References organization + project (via join); never touches 'unused'.
const FUNCTION = `import type { Services } from './services'
export async function run(services: Services) {
  await services.kysely
    .selectFrom('organization')
    .innerJoin('project', 'project.orgId', 'organization.id')
    .selectAll()
    .execute()
  await services.kysely.insertInto('project').values({} as any).execute()
}
`

const FN_FILE = 'addon-fn.ts'

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

function buildProgram(owned: string[]): ts.Program {
  writeAddonDb(owned)
  return ts.createProgram(
    [file(FN_FILE), file('services.ts'), file('addon-db.gen.ts'), file('db.types.ts')],
    COMPILER_OPTIONS
  )
}

describe('discoverOwnedTables (integration, real kysely)', () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'pikku-addon-oracle-'))
    writeFileSync(file('db.types.ts'), DB_TYPES)
    writeFileSync(file('services.ts'), SERVICES)
    writeFileSync(file(FN_FILE), FUNCTION)
    writeAddonDb([])
  })

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('empty owned set errors at the table references (spike, automated)', () => {
    const program = buildProgram([])
    const diagnostics = program
      .getSemanticDiagnostics()
      .filter((d) => d.file?.fileName === file(FN_FILE))
    assert.ok(
      diagnostics.length > 0,
      'expected the empty Pick<DB, never> to reject table references'
    )
    assert.ok(
      diagnostics.every((d) => d.code === 2345),
      'all table-reference errors should be TS2345'
    )
  })

  test('fixpoint recovers exactly the used tables', () => {
    const { owned, residual } = discoverOwnedTables(
      buildProgram,
      new Set([file(FN_FILE)])
    )
    assert.deepEqual(owned, ['organization', 'project'])
    assert.equal(
      residual.length,
      0,
      `unexpected residual: ${residual.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`
    )
  })
})
