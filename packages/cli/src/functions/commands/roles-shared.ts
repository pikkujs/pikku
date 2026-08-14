import { readFile } from 'node:fs/promises'
import type {
  SystemRole,
  SystemRoleDefinitionsMeta,
} from '@pikku/core/ecosystem/role'
import { flattenSystemRoleDefinitions } from '@pikku/core/ecosystem/role'
import { loadDeclaredScopes, openScopeService } from './scopes-shared.js'
import type { OpenedScopeService } from './scopes-shared.js'

type Logger = {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

const isRoleDefinitionsMeta = (
  value: unknown
): value is SystemRoleDefinitionsMeta =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(
    (def) =>
      typeof def === 'object' &&
      def !== null &&
      !Array.isArray(def) &&
      typeof (def as { name?: unknown }).name === 'string' &&
      Array.isArray((def as { scopes?: unknown }).scopes)
  )

/**
 * Reads the generated role metadata and flattens it to the declared role set.
 *
 * Returns `null` — never an empty array — when the file cannot be read, for the
 * same reason `loadDeclaredScopes` does: `prune` removes everything not in this
 * set, so "nothing is declared" and "we failed to find out" have to stay
 * distinguishable or a missing file wipes every system role in the database.
 */
export const loadDeclaredRoles = async (
  rolesMetaJsonFile: string | undefined,
  logger: Logger
): Promise<SystemRole[] | null> => {
  if (!rolesMetaJsonFile) {
    logger.error(
      'pikku roles: no role metadata path is configured.\n' +
        '  Run `pikku all` to generate it.'
    )
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(rolesMetaJsonFile, 'utf8'))
  } catch {
    logger.error(
      `pikku roles: no role metadata at ${rolesMetaJsonFile}.\n` +
        `  Run \`pikku all\` to generate it.`
    )
    return null
  }

  if (!isRoleDefinitionsMeta(parsed)) {
    logger.error(
      `pikku roles: the role metadata at ${rolesMetaJsonFile} is malformed.\n` +
        `  Run \`pikku all\` to regenerate it.`
    )
    return null
  }

  return flattenSystemRoleDefinitions(Object.values(parsed))
}

/**
 * Opens a ScopeService and brings both the scope and the role `declared` marks
 * up to date with the code.
 *
 * Scopes are synced first and not as a courtesy: `pikku_role_scopes` has a
 * foreign key onto `pikku_scopes`, so a role granting a freshly-declared scope
 * cannot be written until that scope's row exists. Both syncs are additive, so
 * doing them inside a read-only command is safe.
 */
export const openScopeServiceForRoles = async (
  args: Parameters<typeof openScopeService>[0] & {
    config: { scopesMetaJsonFile: string }
  },
  roles: SystemRole[],
  command: string
): Promise<OpenedScopeService | null> => {
  const declaredScopes = await loadDeclaredScopes(
    args.config.scopesMetaJsonFile,
    args.logger
  )
  if (!declaredScopes) {
    throw new Error('scope metadata not found')
  }

  const opened = await openScopeService(args, declaredScopes, command)
  if (!opened) {
    return null
  }

  try {
    await opened.service.syncSystemRoles(roles)
  } catch (e) {
    await opened.destroy()
    throw e
  }
  return opened
}

/**
 * Renders undeclared system roles and how many people still hold each — the
 * blast radius, shown before anything is deleted.
 */
export const reportStaleRoles = (
  stale: Array<{ role: string; users: number }>,
  logger: Logger
): void => {
  for (const { role, users } of stale) {
    logger.info(`  ${role.padEnd(40)} held by ${users} user(s)`)
  }
}
