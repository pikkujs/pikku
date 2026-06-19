import ts from 'typescript'

/**
 * Kysely entry points that take a DB table name as their first argument. When a
 * table key is absent from the typed DB, calling one of these with a string
 * literal produces a TS2345 — but the *message* varies (`selectFrom` widens to
 * `string` and prints `TableExpressionOrList`; `insertInto` prints the literal
 * against `never`). So we identify a missing table structurally — a string
 * literal at argument 0 of one of these calls — not by parsing the message.
 *
 * `with`/`withRecursive` are excluded on purpose: their first argument is a CTE
 * alias, not a DB table.
 */
const TABLE_METHODS = new Set([
  'selectFrom',
  'insertInto',
  'replaceInto',
  'updateTable',
  'deleteFrom',
  'mergeInto',
  'innerJoin',
  'leftJoin',
  'rightJoin',
  'fullJoin',
  'crossJoin',
])

function deepestNodeAt(
  sourceFile: ts.SourceFile,
  position: number
): ts.Node | null {
  let found: ts.Node | null = null
  const visit = (node: ts.Node): void => {
    if (position < node.getStart(sourceFile) || position >= node.getEnd()) {
      return
    }
    found = node
    node.forEachChild(visit)
  }
  visit(sourceFile)
  return found
}

function tableMethodName(call: ts.CallExpression): string | null {
  const callee = call.expression
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text
  if (ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression)) {
    return callee.argumentExpression.text
  }
  return null
}

function stripAlias(literal: string): string {
  return literal.split(/\s+as\s+/i)[0]!.trim()
}

/**
 * If `position` lands on a string literal that is argument 0 of a kysely
 * table-entry method, return the referenced table name (alias stripped).
 * Otherwise null — which excludes column references (arg 1+), `.where(...)`
 * predicates, CTE names, and any other string literal.
 */
function tableArgAt(sourceFile: ts.SourceFile, position: number): string | null {
  const node = deepestNodeAt(sourceFile, position)
  if (!node || !ts.isStringLiteralLike(node)) return null

  // Direct: selectFrom('table')
  const parent = node.parent
  if (parent && ts.isCallExpression(parent) && parent.arguments[0] === node) {
    const method = tableMethodName(parent)
    if (method && TABLE_METHODS.has(method)) return stripAlias(node.text)
    return null
  }

  // List form: selectFrom(['a', 'b'])
  if (parent && ts.isArrayLiteralExpression(parent)) {
    const call = parent.parent
    if (call && ts.isCallExpression(call) && call.arguments[0] === parent) {
      const method = tableMethodName(call)
      if (method && TABLE_METHODS.has(method)) return stripAlias(node.text)
    }
  }

  return null
}

function isMissingTableDiagnostic(d: ts.Diagnostic): string | null {
  if (d.code !== 2345 || !d.file || d.start === undefined) return null
  return tableArgAt(d.file, d.start)
}

/**
 * Pure collector over diagnostics — extracted so it can be unit-tested with
 * synthesized diagnostics over a real source file, independent of how the
 * program was built.
 */
export function collectMissingTables(
  diagnostics: readonly ts.Diagnostic[],
  fileNames: Set<string>
): Set<string> {
  const missing = new Set<string>()
  for (const diagnostic of diagnostics) {
    if (!diagnostic.file || !fileNames.has(diagnostic.file.fileName)) continue
    const table = isMissingTableDiagnostic(diagnostic)
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
        isMissingTableDiagnostic(d) === null
    )

  return { owned: [...owned].sort(), residual }
}

/**
 * kysely raw-SQL constructs that build queries from strings the type system
 * never checks against the DB, so table ownership can't be derived from them.
 *
 * The `sql` tagged template (including the `sql<T>\`...\`` type-argument form) is
 * the *silent* case: it produces no diagnostic, so the oracle under-reports the
 * referenced table with no residual to catch it — proven empirically. This gate
 * exists for exactly that class.
 *
 * `db.dynamic.table('x')` is deliberately NOT covered here: kysely type-checks
 * its argument against the DB, so a missing table surfaces as a residual TS2345
 * (a loud failure the residual check already catches), not a silent miss.
 */
const SQL_RAW_MEMBERS = new Set(['raw', 'table'])

export interface RawSqlUsage {
  fileName: string
  /** 1-based line of the offending expression. */
  line: number
  /** The offending expression, single-lined and truncated for the message. */
  text: string
}

/** Local binding names a kysely export is imported under (handles aliases). */
function importedAs(sourceFile: ts.SourceFile, exportName: string): Set<string> {
  const names = new Set<string>()
  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return
    const spec = node.moduleSpecifier
    if (!ts.isStringLiteralLike(spec) || !/(^|\/)kysely(\/|$)/.test(spec.text)) {
      return
    }
    const bindings = node.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        if ((el.propertyName?.text ?? el.name.text) === exportName) {
          names.add(el.name.text)
        }
      }
    }
  })
  return names
}

/**
 * Find kysely raw-SQL usages in a single source file. A bare `sql` tag is always
 * treated as raw — a re-exported or postgres.js `sql` is raw SQL too, and the
 * safe bias for a correctness gate is to flag it. Aliased kysely imports
 * (`import { sql as q }`) are resolved from the import. `sql.raw(...)` /
 * `sql.table(...)` and `CompiledQuery.raw(...)` are the other escape hatches.
 */
export function findRawSqlUsages(sourceFile: ts.SourceFile): RawSqlUsage[] {
  const sqlNames = new Set<string>([...importedAs(sourceFile, 'sql'), 'sql'])
  const cqNames = new Set<string>([
    ...importedAs(sourceFile, 'CompiledQuery'),
    'CompiledQuery',
  ])
  const usages: RawSqlUsage[] = []

  const record = (node: ts.Node): void => {
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
    const text = node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 80)
    usages.push({ fileName: sourceFile.fileName, line, text })
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isTaggedTemplateExpression(node) &&
      ts.isIdentifier(node.tag) &&
      sqlNames.has(node.tag.text)
    ) {
      record(node)
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const base = node.expression.expression
      const member = node.expression.name.text
      if (ts.isIdentifier(base)) {
        if (sqlNames.has(base.text) && SQL_RAW_MEMBERS.has(member)) record(node)
        else if (cqNames.has(base.text) && member === 'raw') record(node)
      }
    }
    node.forEachChild(visit)
  }
  visit(sourceFile)
  return usages
}

/**
 * Gate: a function whose table ownership can't be determined from types must not
 * be bundled into an addon silently. Returns one `[PKU-ADDON-RAWSQL]` error per
 * raw-SQL usage so the caller can fail the generation.
 *
 * Scope is the files passed in. Today those are the bundled leaf functions; once
 * the code-dependency closure exists, run this over the whole closure so raw SQL
 * inside a called helper is caught too — not just at the leaf.
 */
export function checkRawSqlOwnership(
  sourceFiles: readonly ts.SourceFile[]
): string[] {
  const errors: string[] = []
  for (const sourceFile of sourceFiles) {
    for (const u of findRawSqlUsages(sourceFile)) {
      errors.push(
        `[PKU-ADDON-RAWSQL] ${u.fileName}:${u.line} uses raw SQL (\`${u.text}\`) — ` +
          `table ownership can't be determined from types. Rewrite with typed ` +
          `kysely query-builder methods, or exclude this function from the addon.`
      )
    }
  }
  return errors
}
