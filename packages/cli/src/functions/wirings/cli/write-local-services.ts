import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { flattenScopeDefinitions } from '@pikku/core/scope'
import { flattenSystemRoleDefinitions } from '@pikku/core/role'
import type { InspectorState } from '@pikku/inspector'
import { writeFileInDir } from '../../../utils/file-writer.js'
import {
  declaredPackageDependencies,
  ensurePackageDependency,
} from '../../../utils/ensure-package-dependency.js'
import type { Config } from '../../../../types/application-types.js'
import type { CLILogger } from '../../../services/cli-logger.service.js'
import {
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
  declared.has('@pikku/kysely') ||
  declared.has('kysely')

/**
 * Writes `pikku-local-services.gen.ts` and declares what it imports in the
 * project's package.json.
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
  const coercionFile = join(config.outDir, 'db', 'coercion.gen.ts')
  const localCLI = hasLocalCLIEntrypoint(config)
    ? {
        coercionFile: existsSync(coercionFile) ? coercionFile : undefined,
        conventionalSqliteDb: existsSync(join(config.rootDir, 'db', 'sqlite'))
          ? '.pikku-runtime/dev.db'
          : undefined,
        drivers: {
          nodeSqlite: declared.has('@pikku/kysely-node-sqlite'),
          bunSqlite: declared.has('@pikku/kysely-bun-sqlite'),
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
    scopes: flattenScopeDefinitions(visitState.scopes.definitions),
    systemRoles: flattenSystemRoleDefinitions(
      visitState.systemRoles.definitions
    ),
    database,
    localCLI,
  })
  await writeFileInDir(logger, file, code)
  for (const name of localServicesPackages({ database, localCLI })) {
    await ensurePackageDependency(logger, file, name)
  }
}
