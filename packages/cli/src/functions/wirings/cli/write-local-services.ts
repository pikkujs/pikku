import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { flattenScopeDefinitions } from '@pikku/core/scope'
import { flattenSystemRoleDefinitions } from '@pikku/core/role'
import type { InspectorState } from '@pikku/inspector'
import { writeFileInDir } from '../../../utils/file-writer.js'
import {
  declaredPackageDependencies,
  requirePackageDependencies,
} from '../../../utils/require-package-dependencies.js'
import type { Config } from '../../../../types/application-types.js'
import type { CLILogger } from '../../../services/cli-logger.service.js'
import { detectDatabaseDialect } from '../../../utils/database-dialect.js'
import { projectScopeDefinitions } from '../scopes/pikku-command-scopes.js'
import {
  type DatabaseEngine,
  localServicesPackages,
  serializeLocalServices,
} from './serialize-local-services.js'

/** Whether any configured CLI program has a local entrypoint, which imports the file. */
export const hasLocalCLIEntrypoint = (config: Pick<Config, 'cli'>): boolean =>
  Object.values(config.cli?.entrypoints ?? {}).some((entrypoints) =>
    (Array.isArray(entrypoints) ? entrypoints : [entrypoints]).some(
      (entrypoint) =>
        typeof entrypoint === 'string' ||
        (entrypoint.type ?? 'local') === 'local'
    )
  )

/**
 * Whether the project has a database, by the same signs `pikku serve` resolves
 * one from — a `db` config, or a `db/sqlite`, `db/postgres` or `db/mysql` directory — plus
 * the project declaring kysely itself. That last one covers an app whose
 * database comes from its own config's `postgresUrl`, `mysqlUrl` or `sqliteDb`, which
 * codegen cannot evaluate; without it the dev server would find a database the
 * file has no services for.
 */
export const projectHasDatabase = (
  config: Pick<Config, 'db' | 'rootDir'>,
  declared: ReadonlySet<string>
): boolean =>
  config.db !== undefined ||
  existsSync(join(config.rootDir, 'db', 'sqlite')) ||
  existsSync(join(config.rootDir, 'db', 'postgres')) ||
  existsSync(join(config.rootDir, 'db', 'mysql')) ||
  declared.has('@pikku/addon-kysely') ||
  declared.has('kysely')

/**
 * The engine workflow runs are persisted on: the pikku config's `db.engine`,
 * else what the project's migrations directory or `createConfig` names. Left
 * undecided when the project is ambiguous or unreadable, in which case runs
 * stay in memory rather than risk the wrong dialect.
 */
export const projectDatabaseEngine = async (
  logger: CLILogger,
  config: Pick<Config, 'db' | 'rootDir' | 'sourceDirs'>
): Promise<DatabaseEngine | undefined> => {
  if (config.db?.engine) return config.db.engine
  try {
    return await detectDatabaseDialect(
      config.rootDir,
      config.sourceDirs,
      logger
    )
  } catch {
    return undefined
  }
}

/**
 * Writes `pikku-local-services.gen.ts` and fails when the project's
 * package.json does not list what it imports.
 *
 * Written for every project, not only one with a CLI, because `pikku serve`
 * and `pikku dev` load it too.
 */
export const writeLocalServices = async (
  logger: CLILogger,
  config: Config,
  visitState: InspectorState
): Promise<void> => {
  const file = config.localServicesFile
  const declared = await declaredPackageDependencies(file)
  const database = projectHasDatabase(config, declared)
  const engine = database
    ? await projectDatabaseEngine(logger, config)
    : undefined
  const coercionFile = join(config.outDir, 'db', 'coercion.gen.ts')
  const localCLI = hasLocalCLIEntrypoint(config)
    ? {
        coercionFile: existsSync(coercionFile) ? coercionFile : undefined,
        conventionalSqliteDb: existsSync(join(config.rootDir, 'db', 'sqlite'))
          ? '.pikku-runtime/dev.db'
          : undefined,
        drivers: {
          nodeSqlite: declared.has('@pikku/addon-kysely-node-sqlite'),
          bunSqlite: declared.has('@pikku/addon-kysely-bun-sqlite'),
          pg: declared.has('pg'),
          pgTypes: declared.has('@types/pg'),
          mysql: declared.has('mysql2'),
        },
      }
    : undefined
  const code = serializeLocalServices({
    localServicesFile: file,
    packageMappings: config.packageMappings,
    requiredServices: visitState.serviceAggregation.requiredServices,
    scopes: flattenScopeDefinitions(
      projectScopeDefinitions(visitState, config)
    ),
    systemRoles: flattenSystemRoleDefinitions(
      visitState.systemRoles.definitions
    ),
    analyticsEvents: (visitState.analytics ?? []).flatMap(
      (declaration) => declaration.events
    ),
    database,
    engine,
    localCLI,
  })
  await writeFileInDir(logger, file, code)
  await requirePackageDependencies(
    file,
    localServicesPackages({ database, engine, localCLI })
  )
}
