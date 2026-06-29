import ts from 'typescript'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import {
  assembleDbAddon,
  generateScopedDbTypes,
  type AddonAssemblyResult,
} from './addon-assembly.js'
import type { DbEngine } from './addon-table-schema.js'

/** Source file in the inspector program that declares the kysely DB type. */
function findDbTypeSourceFile(
  program: ts.Program,
  dbTypeName: string
): ts.SourceFile | null {
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue
    for (const st of sf.statements) {
      if (
        (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) &&
        st.name.text === dbTypeName
      ) {
        return sf
      }
    }
  }
  return null
}

// Minimal stand-in for the source project's '#pikku'. It exists only so the
// carved function bodies compile with `kysely` scoped to the addon's owned
// tables — the one thing the oracle reads. Every other service is `any`.
const PIKKU_STUB = `import type { Kysely } from 'kysely'
import type { AddonDB } from './addon-db.gen.js'

export interface SingletonServices {
  kysely: Kysely<AddonDB>
  [service: string]: any
}

interface FuncConfig<In, Out> {
  func: (services: SingletonServices, data: In, interaction: any) => Promise<Out> | Out
  expose?: boolean
  name?: string
  docs?: unknown
  permissions?: unknown
  middleware?: unknown
  auth?: boolean
}

export function pikkuFunc<In = any, Out = any>(c: FuncConfig<In, Out>): FuncConfig<In, Out> { return c }
export function pikkuSessionlessFunc<In = any, Out = any>(c: FuncConfig<In, Out>): FuncConfig<In, Out> { return c }
`

export interface DbCarveInput {
  addonName: string
  engine: DbEngine
  /** Inspector program of the source project — provides the DB type + sources. */
  program: ts.Program
  /** Absolute paths of the bundled (carved) function source files. */
  functionFiles: string[]
  /** Union of services the bundled functions use (`kysely` included). */
  requiredServices: string[]
  /** Name of the kysely DB type in the source project. */
  dbTypeName: string
}

export interface DbCarveResult {
  result: AddonAssemblyResult
  /** Content for the addon's `types/db.types.ts` (the source DB type). */
  dbTypesContent: string
}

/**
 * Scope a carved DB addon to the tables it actually owns. Runs the compile-oracle
 * over the carved function sources with `kysely` typed `Kysely<Pick<DB, owned>>`,
 * widening until every table reference resolves, then emits the owned-table SQL +
 * scoped DB type + `pikkuAddonServices` factory via `assembleDbAddon`.
 */
export function carveDbAddon(input: DbCarveInput): DbCarveResult | { error: string } {
  const dbSf = findDbTypeSourceFile(input.program, input.dbTypeName)
  if (!dbSf) {
    return {
      error: `[PKU-ADDON] kysely DB type "${input.dbTypeName}" not found in the source project`,
    }
  }
  const dbTypesContent = dbSf.text

  const require = createRequire(dbSf.fileName)
  const kyselyEntry = require.resolve('kysely')
  const kyselyRoot = kyselyEntry.slice(
    0,
    kyselyEntry.indexOf(`${'/'}kysely${'/'}`) + '/kysely'.length
  )

  const dir = mkdtempSync(join(tmpdir(), 'pikku-addon-carve-'))
  try {
    writeFileSync(join(dir, 'db.types.ts'), dbTypesContent)
    writeFileSync(join(dir, 'pikku-stub.ts'), PIKKU_STUB)

    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2021,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      baseUrl: dir,
      paths: {
        '#pikku': [join(dir, 'pikku-stub.ts')],
        kysely: [join(kyselyRoot, 'dist/index.d.ts')],
        'kysely/*': [join(kyselyRoot, 'dist/*')],
      },
    }

    const buildProgram = (owned: string[]): ts.Program => {
      writeFileSync(
        join(dir, 'addon-db.gen.ts'),
        generateScopedDbTypes(owned, "import type { DB } from './db.types.js'")
      )
      return ts.createProgram(
        [
          ...input.functionFiles,
          join(dir, 'pikku-stub.ts'),
          join(dir, 'addon-db.gen.ts'),
          join(dir, 'db.types.ts'),
        ],
        options
      )
    }

    const functionSources = input.functionFiles
      .map((f) => input.program.getSourceFile(f))
      .filter((s): s is ts.SourceFile => Boolean(s))

    const result = assembleDbAddon({
      addonName: input.addonName,
      engine: input.engine,
      functionFiles: new Set(input.functionFiles),
      functionSources,
      requiredServices: input.requiredServices,
      dbTypeName: input.dbTypeName,
      buildProgram,
    })

    return { result, dbTypesContent }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
