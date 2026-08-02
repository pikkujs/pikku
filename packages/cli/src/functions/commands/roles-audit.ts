import { pikkuSessionlessFunc } from '#pikku'
import {
  loadDeclaredRoles,
  openScopeServiceForRoles,
  reportStaleRoles,
} from './roles-shared.js'

export const rolesAudit = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const declared = await loadDeclaredRoles(config.rolesMetaJsonFile, logger)
    if (!declared) {
      throw new Error('role metadata not found')
    }

    const opened = await openScopeServiceForRoles(
      { config, logger },
      declared,
      'pikku roles audit'
    )
    if (!opened) {
      return
    }

    try {
      const stale = await opened.service.findStaleSystemRoles()

      logger.info(
        `Role audit: ${declared.length} system role(s) declared in code`
      )

      if (stale.length === 0) {
        logger.info('  every system role in the database is still declared')
        return
      }

      logger.info('')
      logger.info(`${stale.length} system role(s) no longer declared in code:`)
      reportStaleRoles(stale, logger)

      const held = stale.filter((s) => s.users > 0)
      logger.info('')
      if (held.length > 0) {
        logger.warn(
          `${held.length} undeclared role(s) are still held by somebody. ` +
            `They are inert — nothing offers them for new grants — but the ` +
            `existing grants persist, and so do whatever scopes the role still carries.`
        )
      }
      logger.info('Run `pikku roles prune --yes` to remove them.')
    } finally {
      await opened.destroy()
    }
  },
})
