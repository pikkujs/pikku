import { pikkuSessionlessFunc } from '#pikku/function'
import {
  loadDeclaredRoles,
  openScopeServiceForRoles,
  reportStaleRoles,
} from './roles-shared.js'

/**
 * Removes system roles that are no longer declared in code, cascading them out
 * of every user grant that holds them.
 *
 * This revokes access, so it never runs implicitly — not at boot, not as part
 * of `pikku all`. Without `--yes` it only reports the blast radius. That is the
 * whole point of the additive sync: deleting a `defineSystemRole` declaration
 * leaves people holding the role until somebody decides otherwise here.
 */
export const rolesPrune = pikkuSessionlessFunc<{ yes?: boolean }, void>({
  remote: true,
  func: async ({ logger, config }, { yes }) => {
    const declared = await loadDeclaredRoles(config.rolesMetaJsonFile, logger)
    if (!declared) {
      throw new Error('role metadata not found')
    }

    const opened = await openScopeServiceForRoles(
      { config, logger },
      declared,
      'pikku roles prune'
    )
    if (!opened) {
      return
    }

    try {
      const stale = await opened.service.findStaleSystemRoles()

      if (stale.length === 0) {
        logger.info('roles prune: nothing to prune')
        return
      }

      logger.info(`${stale.length} system role(s) no longer declared in code:`)
      reportStaleRoles(stale, logger)

      const held = stale.filter((s) => s.users > 0)
      const affectedUsers = stale.reduce((sum, s) => sum + s.users, 0)

      if (!yes) {
        logger.info('')
        if (held.length > 0) {
          logger.warn(
            `Pruning would revoke ${held.length} role(s) from ${affectedUsers} user grant(s).`
          )
        }
        logger.info('Re-run with --yes to remove them.')
        return
      }

      const pruned = await opened.service.pruneSystemRoles()
      logger.info('')
      logger.info(`roles prune: removed ${pruned.length} system role(s)`)
      if (held.length > 0) {
        logger.warn(
          `Revoked from ${affectedUsers} user grant(s). They lose the role's scopes on their next request — unless mapSession sets scopes itself, in which case it is authoritative and they keep them.`
        )
      }
    } finally {
      await opened.destroy()
    }
  },
})
