import { strict as assert } from 'assert'
import { describe, test, before, after } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { assembleDbAddon, generateScopedDbTypes } from './addon-assembly.js'

// End-to-end verifier: generate a DB addon from a project's bundled functions
// (oracle → owned tables → scoped types + pikkuAddonServices + SQL) and then
// COMPILE the produced addon against real kysely. Green here means an addon
// create actually runs: the generated scoped types make the bundled functions
// type-check, and the generated services factory compiles.

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
}
`

// Bundled functions, exactly as they'd be copied from the source project: they
// pull services typed through #pikku and use the (to-be-scoped) kysely.
const LIST_CHARGES = `import type { Services } from '#pikku'
export async function listCharges(services: Services) {
  await services.kysely
    .selectFrom('charge')
    .innerJoin('customer', 'customer.id', 'charge.customerId')
    .selectAll()
    .execute()
}
`
const CREATE_CHARGE = `import type { Services } from '#pikku'
export async function createCharge(services: Services) {
  await services.kysely.insertInto('charge').values({} as any).execute()
}
`

const FN_FILES = ['list-charges.function.ts', 'create-charge.function.ts']
const STUB = 'pikku-types.gen.ts'

const COMPILER_OPTIONS = (): ts.CompilerOptions => ({
  target: ts.ScriptTarget.ES2021,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  baseUrl: dir,
  paths: {
    kysely: [join(kyselyRoot, 'dist/index.d.ts')],
    'kysely/*': [join(kyselyRoot, 'dist/*')],
    '#pikku': [file(STUB)],
  },
})

function writeScoped(owned: string[]): void {
  writeFileSync(
    file('addon-db.gen.ts'),
    generateScopedDbTypes(owned, "import type { DB } from './db.types'")
  )
}

// The #pikku codegen layer pikku itself would emit, stubbed: a scoped Services
// type and a pass-through pikkuAddonServices.
function writeStub(): void {
  writeFileSync(
    file(STUB),
    `import type { Kysely } from 'kysely'
import type { AddonDB } from './addon-db.gen'
export interface Services {
  kysely: Kysely<AddonDB>
  logger: { info(msg: string): void }
}
export const pikkuAddonServices = <T>(
  f: (config: unknown, services: Services) => Promise<T>
) => f
`
  )
}

function programFiles(extra: string[] = []): string[] {
  return [
    ...FN_FILES.map(file),
    file(STUB),
    file('db.types.ts'),
    file('addon-db.gen.ts'),
    ...extra,
  ]
}

// Oracle harness: rebuild with kysely scoped to `owned`.
function buildProgram(owned: string[]): ts.Program {
  writeScoped(owned)
  writeStub()
  return ts.createProgram(programFiles(), COMPILER_OPTIONS())
}

function localDiagnostics(program: ts.Program): ts.Diagnostic[] {
  return [
    ...program.getSemanticDiagnostics(),
    ...program.getSyntacticDiagnostics(),
  ].filter((d) => d.file !== undefined && d.file.fileName.startsWith(dir))
}

describe('addon create (verifier, real kysely)', () => {
  let result: ReturnType<typeof assembleDbAddon>

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'pikku-addon-create-'))
    writeFileSync(file('db.types.ts'), DB_TYPES)
    writeFileSync(file(FN_FILES[0]!), LIST_CHARGES)
    writeFileSync(file(FN_FILES[1]!), CREATE_CHARGE)
    writeScoped([])
    writeStub()

    const functionSources = FN_FILES.map((name, i) =>
      ts.createSourceFile(
        file(name),
        i === 0 ? LIST_CHARGES : CREATE_CHARGE,
        ts.ScriptTarget.Latest,
        true
      )
    )

    result = assembleDbAddon({
      addonName: 'payments',
      engine: 'sqlite',
      functionFiles: new Set(FN_FILES.map(file)),
      functionSources,
      requiredServices: ['kysely', 'logger'],
      dbTypeName: 'DB',
      buildProgram,
    })
  })

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('assembly discovers owned tables and emits artifacts (no errors)', () => {
    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.owned, ['charge', 'customer'])

    const sql = result.files['db/sqlite/0001-payments.sql']
    assert.ok(sql, 'expected owned-table SQL')
    assert.match(sql!, /CREATE TABLE[\s\S]*"charge"/)
    assert.match(sql!, /CREATE TABLE[\s\S]*"customer"/)

    const scoped = result.files['.pikku/addon-db.gen.ts']
    assert.match(scoped!, /Pick<DB, 'charge' \| 'customer'>/)

    const services = result.files['src/services.ts']
    // kysely (host-provided) is declared; logger (auto) is not.
    assert.match(services!, /async \(_config, \{ kysely \}\) => \(\{ kysely \}\)/)
  })

  test('the generated addon compiles green against real kysely', () => {
    // Bring the generated services factory into a program alongside the bundled
    // functions, scoped types, and #pikku stub — the real shape of the addon.
    writeScoped(result.owned)
    writeStub()
    writeFileSync(file('services.ts'), result.files['src/services.ts']!)

    const program = ts.createProgram(
      programFiles([file('services.ts')]),
      COMPILER_OPTIONS()
    )
    const diagnostics = localDiagnostics(program)
    assert.equal(
      diagnostics.length,
      0,
      `addon should compile clean, got:\n` +
        diagnostics
          .map(
            (d) =>
              `  ${d.file?.fileName.replace(dir, '')}: ` +
              ts.flattenDiagnosticMessageText(d.messageText, ' ')
          )
          .join('\n')
    )
  })

  test('scoping is real: under-scoping to just charge fails to compile', () => {
    // Guards the green above against a false pass — if the scoped type were
    // permissive, dropping customer wouldn't break the join.
    writeScoped(['charge'])
    writeStub()
    writeFileSync(file('services.ts'), result.files['src/services.ts']!)
    const program = ts.createProgram(
      programFiles([file('services.ts')]),
      COMPILER_OPTIONS()
    )
    assert.ok(
      localDiagnostics(program).length > 0,
      'expected the customer join to fail when customer is not owned'
    )
  })
})
