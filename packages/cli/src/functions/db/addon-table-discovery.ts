import ts from 'typescript'

/**
 * Kysely reports an unsatisfied table key as TS2345 "Argument of type 'string'
 * is not assignable to parameter of type 'TableExpressionOrList<…>'". The message
 * widens the literal to `string`, so it never names the table — but the diagnostic
 * span points exactly at the offending string-literal argument. We read the table
 * name from the source span instead of parsing the message.
 */
const TABLE_ARG_TYPE = 'TableExpressionOrList'

function findStringLiteralAt(
  sourceFile: ts.SourceFile,
  position: number
): string | null {
  let match: string | null = null
  const visit = (node: ts.Node): void => {
    if (position < node.getStart(sourceFile) || position >= node.getEnd()) {
      return
    }
    if (ts.isStringLiteralLike(node)) {
      match = node.text
      return
    }
    node.forEachChild(visit)
  }
  visit(sourceFile)
  return match
}

/**
 * Extract the set of table names that a kysely program references but whose
 * keys are absent from the current DB type. Pair with a program typed as
 * `Kysely<Pick<DB, never>>` (or a partial set) and the result is exactly the
 * tables still missing. Generalizes for free across selectFrom/insertInto/
 * updateTable/deleteFrom/innerJoin/etc. — they all emit the same TS2345.
 */
function isMissingTableDiagnostic(d: ts.Diagnostic): boolean {
  if (d.code !== 2345) return false
  const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
  return message.includes(TABLE_ARG_TYPE)
}

/**
 * Pure collector over diagnostics — extracted so it can be unit-tested with
 * synthesized diagnostics, independent of how the program was built.
 */
export function collectMissingTables(
  diagnostics: readonly ts.Diagnostic[],
  fileNames: Set<string>
): Set<string> {
  const missing = new Set<string>()
  for (const diagnostic of diagnostics) {
    if (!isMissingTableDiagnostic(diagnostic)) continue
    const file = diagnostic.file
    if (!file || diagnostic.start === undefined) continue
    if (!fileNames.has(file.fileName)) continue
    const table = findStringLiteralAt(file, diagnostic.start)
    if (table) missing.add(table)
  }
  return missing
}

export function extractMissingTables(
  program: ts.Program,
  fileNames: Set<string>
): Set<string> {
  return collectMissingTables(program.getSemanticDiagnostics(), fileNames)
}

export interface OwnedTablesResult {
  owned: string[]
  /** Diagnostics left once every table reference resolves — genuine problems. */
  residual: ts.Diagnostic[]
}

/**
 * Fixpoint discovery of the tables a set of functions owns. Starts with no
 * owned tables, compiles, reads which tables the compiler still demands, adds
 * them, and recompiles until the set stops growing. `buildProgram` rebuilds the
 * program with the addon's kysely typed as `Kysely<Pick<DB, owned>>`.
 */
export function discoverOwnedTables(
  buildProgram: (owned: string[]) => ts.Program,
  fileNames: Set<string>,
  maxRounds = 50
): OwnedTablesResult {
  const owned = new Set<string>()
  let program = buildProgram([])

  for (let round = 0; round < maxRounds; round++) {
    const missing = extractMissingTables(program, fileNames)
    let grew = false
    for (const table of missing) {
      if (!owned.has(table)) {
        owned.add(table)
        grew = true
      }
    }
    if (!grew) break
    program = buildProgram([...owned])
  }

  const residual = program
    .getSemanticDiagnostics()
    .filter(
      (d) =>
        d.file !== undefined &&
        fileNames.has(d.file.fileName) &&
        !isMissingTableDiagnostic(d)
    )

  return { owned: [...owned].sort(), residual }
}
