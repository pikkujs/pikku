import ts from 'typescript'
import type { ColumnInfo } from './db-introspector.js'
import {
  checkForeignKeyClosure,
  diffTablesToSql,
  type DbEngine,
  type TableSchema,
} from './addon-table-schema.js'
import {
  checkRawSqlOwnership,
  discoverOwnedTables,
} from './addon-table-discovery.js'

/** Services pikkuAddonServices always provides from the host — never declared. */
const AUTO_PROVIDED = new Set(['config', 'logger', 'variables', 'secrets', 'schema'])

/**
 * Generate the addon's `pikkuAddonServices` factory. Every service the bundled
 * functions use that the host provides (e.g. `kysely`) is declared in the
 * 2nd-param destructure — that's the `addonRequiredParentServices` contract the
 * consumer reads. Base services (logger/variables/secrets) are auto-provided, so
 * they're omitted from both the destructure and the return.
 */
export function generateAddonServices(requiredServices: string[]): string {
  const extra = [...new Set(requiredServices)]
    .filter((s) => !AUTO_PROVIDED.has(s))
    .sort()
  const inner = extra.length ? ` ${extra.join(', ')} ` : ''
  return `import { pikkuAddonServices } from '#pikku'

// Services this addon requires from the host (recorded as required parent services).
export const createSingletonServices = pikkuAddonServices(
  async (_config, {${inner}}) => ({${inner}})
)
`
}

/**
 * Generate the addon's scoped DB type — `Pick<DB, owned>` — so the bundled
 * functions only ever see the tables the addon owns.
 */
export function generateScopedDbTypes(
  owned: string[],
  dbImport = "import type { DB } from '../types/db.types.js'"
): string {
  // `Pick<DB, never>` (not `Record<string, never>`): the empty case must have
  // `keyof = never` so the oracle's first round rejects every table reference.
  const pick = owned.length
    ? `Pick<DB, ${owned.map((t) => `'${t}'`).join(' | ')}>`
    : 'Pick<DB, never>'
  return `${dbImport}\nexport type AddonDB = ${pick}\n`
}

function isNullable(type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.some(
      (t) => (t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) !== 0
    )
  }
  return (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) !== 0
}

function mapTsTypeToSql(
  type: ts.Type,
  checker: ts.TypeChecker,
  engine: DbEngine
): string {
  const probe = type.isUnion()
    ? type.types.filter(
        (t) => (t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) === 0
      )
    : [type]
  const all = (mask: ts.TypeFlags) => probe.every((t) => (t.flags & mask) !== 0)

  if (all(ts.TypeFlags.NumberLike)) return 'INTEGER'
  if (all(ts.TypeFlags.BooleanLike)) {
    return engine === 'postgres' ? 'BOOLEAN' : 'INTEGER'
  }
  if (all(ts.TypeFlags.StringLike)) return 'TEXT'
  if (probe.some((t) => /\bDate\b/.test(checker.typeToString(t)))) {
    return engine === 'postgres' ? 'TIMESTAMP' : 'TEXT'
  }
  return 'TEXT'
}

function findDbType(
  program: ts.Program,
  dbTypeName: string
): ts.Type | null {
  const checker = program.getTypeChecker()
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue
    for (const st of sf.statements) {
      if (
        (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) &&
        st.name.text === dbTypeName
      ) {
        return checker.getTypeAtLocation(st)
      }
    }
  }
  return null
}

/**
 * Derive each owned table's column schema from the kysely `DB` type (which is
 * itself codegen'd from the source schema). Foreign keys aren't carried in the
 * type, so callers that need FK closure enforced must pass introspected schemas
 * instead. `id` is treated as the primary key by convention.
 */
export function extractOwnedTableSchemas(
  program: ts.Program,
  dbTypeName: string,
  owned: string[],
  engine: DbEngine
): TableSchema[] {
  const checker = program.getTypeChecker()
  const dbType = findDbType(program, dbTypeName)
  if (!dbType) {
    throw new Error(`[PKU-ADDON] DB type "${dbTypeName}" not found in program`)
  }

  return owned.map((table) => {
    const tableSym = dbType.getProperty(table)
    if (!tableSym || !tableSym.valueDeclaration) {
      throw new Error(`[PKU-ADDON] owned table "${table}" not found on DB type`)
    }
    const tableType = checker.getTypeOfSymbolAtLocation(
      tableSym,
      tableSym.valueDeclaration
    )
    const columns: ColumnInfo[] = tableType.getProperties().map((colSym) => {
      const colType = checker.getTypeOfSymbolAtLocation(
        colSym,
        colSym.valueDeclaration ?? tableSym.valueDeclaration!
      )
      const optional = (colSym.flags & ts.SymbolFlags.Optional) !== 0
      return {
        name: colSym.name,
        type: mapTsTypeToSql(colType, checker, engine),
        notNull: !optional && !isNullable(colType),
        pk: colSym.name === 'id',
        defaultValue: null,
      }
    })
    return { name: table, columns, foreignKeys: [] }
  })
}

export interface AddonAssemblyInput {
  addonName: string
  engine: DbEngine
  /** Absolute paths of the bundled function files, as seen by `buildProgram`. */
  functionFiles: Set<string>
  /** Parsed (parent-pointer'd) function sources, for the raw-SQL gate. */
  functionSources: readonly ts.SourceFile[]
  /** Union of `meta.services` across the bundled functions. */
  requiredServices: string[]
  /** Name of the kysely DB type in the source project (usually `DB`). */
  dbTypeName: string
  /** Rebuilds the program with the addon's kysely typed `Kysely<Pick<DB, owned>>`. */
  buildProgram: (owned: string[]) => ts.Program
  /** Optional introspected schemas (preferred — carries FK/pk/defaults). */
  introspected?: TableSchema[]
}

export interface AddonAssemblyResult {
  owned: string[]
  /** Generated addon files keyed by addon-relative path. Empty when errors. */
  files: Record<string, string>
  warnings: string[]
  /** Fatal problems — raw SQL, unresolved references, or a FK escaping the addon. */
  errors: string[]
}

/**
 * Assemble a DB addon from a set of bundled functions: gate raw SQL, discover the
 * owned tables via the compile-oracle, derive their schema, enforce FK closure,
 * and emit the owned-table SQL + scoped DB types + `pikkuAddonServices` factory.
 * Returns errors (never throws on a determinable failure) so the caller decides
 * how to surface them.
 */
export function assembleDbAddon(
  input: AddonAssemblyInput
): AddonAssemblyResult {
  const errors: string[] = []

  // Gate first — raw SQL means ownership can't be determined at all.
  errors.push(...checkRawSqlOwnership(input.functionSources))
  if (errors.length) {
    return { owned: [], files: {}, warnings: [], errors }
  }

  const { owned, residual } = discoverOwnedTables(
    input.buildProgram,
    input.functionFiles
  )
  for (const d of residual) {
    const where =
      d.file && d.start !== undefined
        ? `${d.file.fileName}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}`
        : '<unknown>'
    errors.push(
      `[PKU-ADDON-RESIDUAL] ${where} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
    )
  }
  if (errors.length) {
    return { owned, files: {}, warnings: [], errors }
  }

  const program = input.buildProgram(owned)
  const schemas =
    input.introspected ??
    extractOwnedTableSchemas(program, input.dbTypeName, owned, input.engine)

  errors.push(...checkForeignKeyClosure(schemas, new Set(owned)))
  if (errors.length) {
    return { owned, files: {}, warnings: [], errors }
  }

  const { statements, warnings } = diffTablesToSql(
    schemas,
    [],
    input.engine,
    new Set(owned)
  )

  const files: Record<string, string> = {
    [`db/${input.engine}/0001-${input.addonName}.sql`]:
      statements.join('\n\n') + '\n',
    '.pikku/addon-db.gen.ts': generateScopedDbTypes(owned),
    'src/services.ts': generateAddonServices(input.requiredServices),
  }

  return { owned, files, warnings, errors }
}
