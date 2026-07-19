import { pikkuSessionlessFunc } from '#pikku'
import {
  loadDeclaredScopes,
  openScopeService,
  reportStaleScopes,
} from './scopes-shared.js'

export const scopesAudit = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const declared = await loadDeclaredScopes(config.scopesMetaJsonFile, logger)
    if (!declared) {
      throw new Error('scope metadata not found')
    }

    const opened = await openScopeService(
      { config, logger },
      declared,
      'pikku scopes audit'
    )
    if (!opened) {
      return
    }

    try {
      const stale = await opened.service.findStaleScopes()

      logger.info(`Scope audit: ${declared.length} scope(s) declared in code`)

      if (stale.length === 0) {
        logger.info('  every scope in the database is still declared')
        return
      }

      logger.info('')
      logger.info(`${stale.length} scope(s) no longer declared in code:`)
      reportStaleScopes(stale, logger)

      const granted = stale.filter((s) => s.roles.length > 0)
      logger.info('')
      if (granted.length > 0) {
        logger.warn(
          `${granted.length} undeclared scope(s) are still granted by a role. ` +
            `They authorize nothing — no function can require a scope that is not declared — ` +
            `but the grants persist until removed.`
        )
      }
      logger.info('Run `pikku scopes prune --yes` to remove them.')
    } finally {
      await opened.destroy()
    }
  },
})
