import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ContributorPlatform } from '@pikku/core/contributors'
import { readCoercionMap } from '../functions/db/db-codegen.js'
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
  srcDirectories: string[],
  logger: DebugLogger
): Promise<UserConfigShape | null> {
  try {
    return await loadUserConfigForDb({
      config: { rootDir: projectDir, srcDirectories },
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
  srcDirectories: string[],
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

  const userConfig = await loadConfiguredDb(projectDir, srcDirectories, logger)

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

export interface ContributorPlatformFacts {
  projectDir: string
  /** Where `db/coercion.gen.ts` lives (`<pikkuDir>/db/coercion.gen.ts`). */
  pikkuDir: string
  srcDirectories: string[]
  logger: DebugLogger
  /** Service names the app (dev) or the unit (deploy) requires. */
  serviceNames: Iterable<string>
  /** Baseline services the adapter holds before any contributor runs. */
  runtimeServices?: string[]
  /** Overrides what `needsQueue/Workflow/Agent` would be derived as from `serviceNames`. */
  needs?: { queue?: boolean; workflow?: boolean; agent?: boolean }
  /** Passed to `detectDatabaseDialect` for its error messages. */
  subject?: string
}

/**
 * The one place `ContributorPlatform` is built, for `pikku dev` and every
 * deploy path. Adapters only add their own `runtimeServices`.
 *
 * `db` is set for sqlite and postgres. MySQL is a database the app has but no
 * contributor engine, so it leaves `db` unset and the caller decides whether
 * that is an error (the standalone bundle refuses it).
 */
export async function buildContributorPlatform(
  facts: ContributorPlatformFacts
): Promise<ContributorPlatform> {
  const serviceNames = [...facts.serviceNames]
  const dialect = await detectDatabaseDialect(
    facts.projectDir,
    facts.srcDirectories,
    facts.logger,
    facts.subject
  )
  const coercionMap =
    dialect === 'sqlite' || dialect === 'postgres'
      ? readCoercionMap(join(facts.pikkuDir, 'db', 'coercion.gen.ts'))
      : undefined
  return {
    serviceNames,
    needsQueue: facts.needs?.queue ?? serviceNames.includes('queueService'),
    needsWorkflow:
      facts.needs?.workflow ?? serviceNames.includes('workflowService'),
    needsAgent: facts.needs?.agent ?? serviceNames.includes('agentRunner'),
    ...(facts.runtimeServices
      ? { runtimeServices: facts.runtimeServices }
      : {}),
    ...(dialect === 'sqlite' || dialect === 'postgres'
      ? { db: { engine: dialect, ...(coercionMap ? { coercionMap } : {}) } }
      : {}),
  }
}
