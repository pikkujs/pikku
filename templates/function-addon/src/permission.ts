import { pikkuPermission, addPermission } from '../.pikku/pikku-types.gen.js'

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

/**
 * Tag permission for addon functions
 */
export const tagPermission = pikkuPermission(
  async ({ logger }, _data, _wire) => {
    logger.info({
      type: 'addon-tag-permission',
      name: 'addon',
    })
    return true // Always allow for testing
  }
)

/**
 * Register 'addon' tag permission
 * This will apply to all functions with the 'addon' tag
 */
export const addonTagPermission = () => addPermission('addon', [tagPermission])
