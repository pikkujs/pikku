import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import {
  checkRawSqlOwnership,
  collectMissingTables,
  discoverOwnedTables,
  findRawSqlUsages,
} from './addon-table-discovery.js'

// A real source file so the extractor can inspect AST structure. Tables appear
// at argument 0 of table-entry methods; the column ref is argument 0 of
// `.where(...)` (not a table method) and must NOT be collected.
const FILE = 'addon.ts'
const SRC = [
  `await kysely.selectFrom('organization').selectAll().execute()`,
  `await kysely.insertInto('project').values({}).execute()`,
  `await kysely.selectFrom('organization').where('organization.id', '=', '1').execute()`,
].join('\n')

const sourceFile = ts.createSourceFile(
  FILE,
  SRC,
  ts.ScriptTarget.Latest,
  /* setParentNodes */ true
)

// Diagnostics are shaped as the probe proved kysely emits them: TS2345 with the
// span on the offending string-literal argument. The message text is irrelevant
// to the structural extractor, so we don't bother matching it.
const diagAt = (literal: string): ts.Diagnostic => ({
  file: sourceFile,
  start: SRC.indexOf(`'${literal}'`),
  length: literal.length + 2,
  code: 2345,
  category: ts.DiagnosticCategory.Error,
  messageText: `Argument of type 'string' is not assignable.`,
})

describe('collectMissingTables', () => {
  test('reads tables from selectFrom and insertInto arg-0 spans', () => {
    const missing = collectMissingTables(
      [diagAt('organization'), diagAt('project')],
      new Set([FILE])
    )
    assert.deepEqual([...missing].sort(), ['organization', 'project'])
  })

  test('ignores a column reference (arg 1 of .where)', () => {
    const missing = collectMissingTables([diagAt('organization.id')], new Set([
      FILE,
    ]))
    assert.equal(missing.size, 0)
  })

  test('ignores diagnostics from other files', () => {
    const missing = collectMissingTables([diagAt('organization')], new Set([
      'somewhere-else.ts',
    ]))
    assert.equal(missing.size, 0)
  })

  test('ignores non-2345 diagnostics', () => {
    const notArg: ts.Diagnostic = {
      file: sourceFile,
      start: SRC.indexOf(`'organization'`),
      length: 14,
      code: 2304,
      category: ts.DiagnosticCategory.Error,
      messageText: `Cannot find name 'kysely'.`,
    }
    assert.equal(collectMissingTables([notArg], new Set([FILE])).size, 0)
  })
})

describe('discoverOwnedTables (fixpoint)', () => {
  const ALL = ['organization', 'project']
  const buildProgram = (owned: string[]): ts.Program => {
    const ownedSet = new Set(owned)
    const diagnostics = ALL.filter((t) => !ownedSet.has(t)).map(diagAt)
    return {
      getSemanticDiagnostics: () => diagnostics,
    } as unknown as ts.Program
  }

  test('converges on the complete owned-table set', () => {
    const { owned, residual } = discoverOwnedTables(buildProgram, new Set([FILE]))
    assert.deepEqual(owned, ['organization', 'project'])
    assert.equal(residual.length, 0)
  })

  test('surfaces genuine (non-table) errors as residual', () => {
    const realError: ts.Diagnostic = {
      file: sourceFile,
      start: 0,
      length: 5,
      code: 2304,
      category: ts.DiagnosticCategory.Error,
      messageText: `Cannot find name 'kysely'.`,
    }
    const program = {
      getSemanticDiagnostics: () => [realError],
    } as unknown as ts.Program
    const { owned, residual } = discoverOwnedTables(
      () => program,
      new Set([FILE])
    )
    assert.deepEqual(owned, [])
    assert.equal(residual.length, 1)
    assert.equal(residual[0]!.code, 2304)
  })
})

describe('raw-SQL ownership gate', () => {
  const sf = (src: string) =>
    ts.createSourceFile('fn.ts', src, ts.ScriptTarget.Latest, true)

  test('flags a `sql` tagged template (incl. the sql<T>`...` form)', () => {
    const a = findRawSqlUsages(
      sf("import { sql } from 'kysely'\nawait sql`select * from audit_log`.execute(db)")
    )
    const b = findRawSqlUsages(
      sf("import { sql } from 'kysely'\nawait sql<{ id: string }>`select id from audit_log`.execute(db)")
    )
    assert.equal(a.length, 1)
    assert.equal(b.length, 1)
  })

  test('flags sql.raw and sql.table, plus CompiledQuery.raw', () => {
    const usages = findRawSqlUsages(
      sf(
        "import { sql, CompiledQuery } from 'kysely'\n" +
          "await db.executeQuery(sql.raw('select * from audit_log'))\n" +
          "db.selectFrom(sql.table('audit_log').as('a'))\n" +
          "await db.executeQuery(CompiledQuery.raw('select 1'))"
      )
    )
    assert.equal(usages.length, 3)
  })

  test('resolves an aliased kysely `sql` import', () => {
    const usages = findRawSqlUsages(
      sf("import { sql as q } from 'kysely'\nawait q`select 1`.execute(db)")
    )
    assert.equal(usages.length, 1)
  })

  test('does not flag typed query-builder calls or sql.ref', () => {
    const usages = findRawSqlUsages(
      sf(
        "import { sql } from 'kysely'\n" +
          "await db.selectFrom('organization').selectAll().execute()\n" +
          "db.selectFrom('project').orderBy(sql.ref('project.id')).execute()"
      )
    )
    assert.deepEqual(usages, [])
  })

  test('checkRawSqlOwnership emits one PKU-ADDON-RAWSQL error per usage', () => {
    const clean = sf("await db.selectFrom('organization').execute()")
    const raw = ts.createSourceFile(
      'audit.function.ts',
      "import { sql } from 'kysely'\nawait sql`select * from audit_log`.execute(db)",
      ts.ScriptTarget.Latest,
      true
    )
    assert.deepEqual(checkRawSqlOwnership([clean]), [])
    const errors = checkRawSqlOwnership([clean, raw])
    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /\[PKU-ADDON-RAWSQL\] audit\.function\.ts:2/)
  })
})
