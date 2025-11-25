import { pikkuPermission, addPermission } from '../../.pikku/pikku-types.gen.js'

/**
 * External package permission that logs permission checks
 */
export const externalPermission = pikkuPermission(
  async ({ logger }, _data, _wire) => {
    logger.info({
      type: 'external-function-permission',
      name: 'external',
    })
    return true // Always allow for testing
  }
)

/**
 * Tag permission for external functions
 */
export const tagPermission = pikkuPermission(
  async ({ logger }, _data, _wire) => {
    logger.info({
      type: 'external-tag-permission',
      name: 'external',
    })
    return true // Always allow for testing
  }
)

/**
 * Register 'external' tag permission
 * This will apply to all functions with the 'external' tag
 */
export const externalTagPermission = () =>
  addPermission('external', [tagPermission])
