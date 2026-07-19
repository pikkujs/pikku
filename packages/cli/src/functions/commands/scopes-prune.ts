import { pikkuSessionlessFunc } from '#pikku'
import {
  loadDeclaredScopes,
  openScopeService,
  reportStaleScopes,
} from './scopes-shared.js'

/**
 * Removes scopes that are no longer declared in code, cascading them out of
 * every role that holds them.
 *
 * This revokes access, so it never runs implicitly — not at boot, not as part
 * of `pikku all`. Without `--yes` it only reports the blast radius.
 */
export const scopesPrune = pikkuSessionlessFunc<{ yes?: boolean }, void>({
  remote: true,
  func: async ({ logger, config }, { yes }) => {
    const declared = await loadDeclaredScopes(config.scopesMetaJsonFile, logger)
    if (!declared) {
      throw new Error('scope metadata not found')
    }

    const opened = await openScopeService(
      { config, logger },
      declared,
      'pikku scopes prune'
    )
    if (!opened) {
      return
    }

    try {
      const stale = await opened.service.findStaleScopes()

      if (stale.length === 0) {
        logger.info('scopes prune: nothing to prune')
        return
      }

      logger.info(`${stale.length} scope(s) no longer declared in code:`)
      reportStaleScopes(stale, logger)

      const granted = stale.filter((s) => s.roles.length > 0)
      const affectedRoles = new Set(stale.flatMap(({ roles }) => roles))

      if (!yes) {
        logger.info('')
        if (granted.length > 0) {
          logger.warn(
            `Pruning would revoke ${granted.length} scope(s) from the roles above.`
          )
        }
        logger.info('Re-run with --yes to remove them.')
        return
      }

      const pruned = await opened.service.pruneScopes()
      logger.info('')
      logger.info(`scopes prune: removed ${pruned.length} scope(s)`)
      if (granted.length > 0) {
        logger.warn(
          `Revoked from ${affectedRoles.size} role(s). Users holding those roles lose these scopes on their next request.`
        )
      }
    } finally {
      await opened.destroy()
    }
  },
})
