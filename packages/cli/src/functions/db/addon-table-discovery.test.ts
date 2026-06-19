import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import {
  collectMissingTables,
  discoverOwnedTables,
} from './addon-table-discovery.js'

// Shapes the diagnostics exactly as the compile-oracle spike proved real kysely
// emits them: code 2345, message naming TableExpressionOrList, span on the
// string-literal table argument (the message itself never names the table).
const FILE = 'addon.ts'
const SRC = [
  `await kysely.selectFrom('organization').selectAll().execute()`,
  `await kysely.selectFrom('project').selectAll().execute()`,
].join('\n')

const sourceFile = ts.createSourceFile(
  FILE,
  SRC,
  ts.ScriptTarget.Latest,
  /* setParentNodes */ true
)

const tableDiag = (table: string): ts.Diagnostic => ({
  file: sourceFile,
  start: SRC.indexOf(`'${table}'`),
  length: table.length + 2,
  code: 2345,
  category: ts.DiagnosticCategory.Error,
  messageText:
    `Argument of type 'string' is not assignable to parameter of type ` +
    `'TableExpressionOrList<EmptyDB, never>'.`,
})

describe('collectMissingTables', () => {
  test('reads the table name from the diagnostic span, not the message', () => {
    const missing = collectMissingTables(
      [tableDiag('organization'), tableDiag('project')],
      new Set([FILE])
    )
    assert.deepEqual([...missing].sort(), ['organization', 'project'])
  })

  test('ignores diagnostics from other files', () => {
    const missing = collectMissingTables([tableDiag('organization')], new Set([
      'somewhere-else.ts',
    ]))
    assert.equal(missing.size, 0)
  })

  test('ignores unrelated diagnostics (wrong code or message)', () => {
    const notTableArg: ts.Diagnostic = {
      file: sourceFile,
      start: SRC.indexOf(`'organization'`),
      length: 14,
      code: 2304,
      category: ts.DiagnosticCategory.Error,
      messageText: `Cannot find name 'kysely'.`,
    }
    const missing = collectMissingTables([notTableArg], new Set([FILE]))
    assert.equal(missing.size, 0)
  })
})

describe('discoverOwnedTables (fixpoint)', () => {
  // buildProgram reports every still-unowned table as missing; once a table is
  // in the owned set it resolves. The loop must converge on the full set.
  const ALL = ['organization', 'project']
  const buildProgram = (owned: string[]): ts.Program => {
    const ownedSet = new Set(owned)
    const diagnostics = ALL.filter((t) => !ownedSet.has(t)).map(tableDiag)
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
