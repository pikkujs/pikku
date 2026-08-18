import { pikkuPermission } from '#pikku/addon/auth'

/**
 * Addon package permission that logs permission checks
 */
export const addonPermission = pikkuPermission(
  async ({ logger }, _data, _wire) => {
    logger.info({
      type: 'addon-function-permission',
      name: 'addon',
    })
    return true // Always allow for testing
  }
)
