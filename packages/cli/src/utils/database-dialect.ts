import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadUserConfigForDb,
  type UserConfigShape,
} from '../functions/commands/db-shared.js'

export type DatabaseDialect = 'sqlite' | 'postgres' | 'mysql'

interface DebugLogger {
  debug(msg: string): void
}

/**
 * The project's own database declaration, or nothing it could read.
 *
 * A config that throws, or names no `createConfig` at all, is reported as no
 * declaration rather than as a build failure: it is only ever one of two
 * signals, and the directory conventions still answer for a project whose
 * config needs an environment this build does not have.
 */
export async function loadConfiguredDb(
  projectDir: string,
  sourceDirs: string[],
  logger: DebugLogger
): Promise<UserConfigShape | null> {
  try {
    return await loadUserConfigForDb({
      config: { rootDir: projectDir, sourceDirs },
      logger: {
        error: (msg) => logger.debug(msg),
        warn: (msg) => logger.debug(msg),
      },
    })
  } catch (error: any) {
    logger.debug(
      `Could not read createConfig to resolve the database: ${error?.message ?? error}`
    )
    return null
  }
}

export const listAll = (names: string[]): string =>
  `${names.length === 2 ? 'both' : 'all of'} ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/**
 * The database dialect a project declares, or undefined when it has none.
 *
 * Resolved the way every pikku host resolves it: `createConfig` first, through
 * the same `loadUserConfigForDb` the db commands use, and the `db/<dialect>`
 * folders only as the fallback. Several dialects in either place is refused
 * rather than resolved: picking one would be picking which database the app
 * talks to on the strength of directory order, and the failure (an app running
 * happily against the wrong, fully valid schema) is invisible until someone
 * reads the data.
 *
 * `subject` names who could not decide, for the error ("a standalone build").
 */
export async function detectDatabaseDialect(
  projectDir: string,
  sourceDirs: string[],
  logger: DebugLogger,
  subject = 'the build'
): Promise<DatabaseDialect | undefined> {
  const present = (['sqlite', 'postgres', 'mysql'] as const).filter((engine) =>
    existsSync(join(projectDir, 'db', engine))
  )

  if (present.length > 1) {
    throw new Error(
      `This project has ${listAll(present.map((engine) => `db/${engine}`))} migrations, so ${subject} cannot tell which database the app is meant to open. Keep the one this app deploys against.`
    )
  }

  const userConfig = await loadConfiguredDb(projectDir, sourceDirs, logger)

  const configured = (
    [
      ['postgres', 'postgresUrl'],
      ['sqlite', 'sqliteDb'],
      ['mysql', 'mysqlUrl'],
    ] as const
  ).filter(([, key]) => userConfig?.[key])
  if (configured.length > 1) {
    throw new Error(
      `createConfig sets ${listAll(configured.map(([, key]) => key))}, so ${subject} cannot tell which database the app is meant to open. Configure exactly one database dialect.`
    )
  }

  return configured[0]?.[0] ?? present[0]
}

/**
 * The sentence `pikku validate` uses when the project has a database but the
 * pikku config declares no `db`.
 */
export const dbConfigMismatch = (engine: DatabaseDialect): string =>
  `the project has a ${engine} database (createConfig or db/${engine}) but the pikku config has no \`db\``
