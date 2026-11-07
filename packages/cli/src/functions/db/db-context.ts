import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely'
import { compilePikkuSchemas } from '@pikku/kysely'
import { splitStatements, statementShape } from '@pikku/migrator-sql'
import { loadUserConfigForDb } from '../commands/db-shared.js'
import { resolveDb } from './local-db.js'
import { loadTableDeclaration, TABLES_FILE } from './table-declaration.js'

const silent = { error: () => {}, warn: () => {} }

/** Compiles DDL to text and never connects to anything. */
const compileOnlyKysely = () =>
  new Kysely<any>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  })

/** The tables `db/tables.ts` names, or why it could not be read. */
async function declaredTableNames(
  rootDir: string
): Promise<{ declared: string[]; error?: string }> {
  try {
    const declaration = await loadTableDeclaration(rootDir)
    if (!declaration) return { declared: [] }
    const statements = splitStatements(
      compilePikkuSchemas(compileOnlyKysely(), [declaration.schema])
    )
    return {
      declared: statements.flatMap((statement) => {
        const shape = statementShape(statement)
        return shape.kind === 'table' ? [shape.table] : []
      }),
    }
  } catch (error: any) {
    return { declared: [], error: error.message }
  }
}

/** The project's database context, for `pikku meta context` and `pikku meta db`. */
export async function databaseContext(config: {
  rootDir: string
  outDir: string
  srcDirectories: string[]
  runtimeDir?: string
  db?: Parameters<typeof resolveDb>[4]
}) {
  let dialect: string | null = null
  try {
    const userConfig = await loadUserConfigForDb({ config, logger: silent })
    dialect = userConfig
      ? (resolveDb(
          userConfig,
          config.rootDir,
          config.outDir,
          config.runtimeDir,
          config.db
        )?.dialect ?? null)
      : null
  } catch {
    // Context is for planning: a config that will not load is reported by the
    // commands that need it, and must not take the rest of the answer with it.
  }

  const generated = (file: string) =>
    relative(config.rootDir, join(config.outDir, 'db', file))

  return {
    dialect,
    tables: {
      file: TABLES_FILE,
      export: 'tables',
      exists: existsSync(join(config.rootDir, TABLES_FILE)),
      ...(await declaredTableNames(config.rootDir)),
    },
    types: {
      schema: generated('schema.gen.ts'),
      zod: generated('zod.gen.ts'),
    },
    workflow: [
      `Declare or change tables, and their annotations, in ${TABLES_FILE} with defineTables from @pikku/kysely.`,
      '`pikku db generate` writes the SQL. It only adds tables, columns and indexes, and refuses anything else with the reason.',
      '`pikku db migrate` applies it and regenerates the types.',
    ],
  }
}
