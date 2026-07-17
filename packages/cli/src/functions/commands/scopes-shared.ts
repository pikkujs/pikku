import { readFile } from 'node:fs/promises'
import type { FlatScope, ScopeDefinitionsMeta } from '@pikku/core/scope'
import { flattenScopeDefinitions } from '@pikku/core/scope'
import { KyselyScopeService } from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import { createKysely, resolveDb } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'
import type { UserConfigShape } from './db-shared.js'

type Logger = {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

/**
 * Reads the generated scope metadata and flattens it to the declared scope set.
 *
 * Returns `null` — never an empty array — when the file cannot be read, so a
 * caller can tell "nothing is declared" apart from "we failed to find out".
 * `prune` deletes everything not in this set, so conflating the two would wipe
 * every scope in the database.
 */
export const loadDeclaredScopes = async (
  scopesMetaJsonFile: string,
  logger: Logger
): Promise<FlatScope[] | null> => {
  let meta: ScopeDefinitionsMeta
  try {
    meta = JSON.parse(
      await readFile(scopesMetaJsonFile, 'utf8')
    ) as ScopeDefinitionsMeta
  } catch {
    logger.error(
      `pikku scopes: no scope metadata at ${scopesMetaJsonFile}.\n` +
        `  Run \`pikku all\` to generate it.`
    )
    return null
  }

  return flattenScopeDefinitions(Object.values(meta))
}

export type OpenedScopeService = {
  service: KyselyScopeService
  destroy: () => Promise<void>
}

/**
 * Opens a ScopeService against the project's configured database and brings the
 * `declared` marks up to date with the code.
 *
 * The sync is deliberate: the marks are otherwise only as fresh as the last app
 * boot, so an audit run straight after a code change would report stale
 * answers. It is safe to do here because syncing is purely additive — it
 * upserts and marks, and never deletes a scope or revokes a grant.
 */
export const openScopeService = async (
  {
    config,
    logger,
  }: {
    config: {
      rootDir: string
      outDir: string
      runtimeDir?: string
      srcDirectories: string[]
    }
    logger: Logger
  },
  declared: FlatScope[],
  command: string
): Promise<OpenedScopeService | null> => {
  const userConfig: UserConfigShape | null = await loadUserConfigForDb({
    config,
    logger,
  })
  if (!userConfig) {
    return null
  }

  const resolved = resolveDb(
    userConfig,
    config.rootDir,
    config.outDir,
    config.runtimeDir
  )
  if (!resolved) {
    logger.error(
      `${command}: no database configured — set sqliteDb or postgresUrl in your createConfig.`
    )
    throw new Error('no database configured')
  }

  const db = await createKysely<KyselyPikkuDB>(resolved)
  const service = new KyselyScopeService(db)
  await service.init()
  await service.syncScopes(declared)

  return { service, destroy: () => db.destroy() }
}

/**
 * Renders undeclared scopes and the roles that would lose them — the blast
 * radius, shown before anything is deleted.
 */
export const reportStaleScopes = (
  stale: Array<{ scope: string; roles: string[] }>,
  logger: Logger
): void => {
  for (const { scope, roles } of stale) {
    const held =
      roles.length > 0
        ? `held by ${roles.length} role(s): ${roles.join(', ')}`
        : 'held by no role'
    logger.info(`  ${scope.padEnd(40)} ${held}`)
  }
}
