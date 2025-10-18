import { pikkuPermission } from '../../.pikku/pikku-types.gen.js'

export const adminTagPermission = pikkuPermission(
  async ({ logger }, _data, session) => {
    logger.info({
      type: 'tag-permission',
      name: 'admin',
      sessionExists: !!session,
    })
    // Return false to ensure all permissions run
    return false
  }
)

export const readTagPermission = pikkuPermission(
  async ({ logger }, _data, session) => {
    logger.info({
      type: 'tag-permission',
      name: 'read',
      sessionExists: !!session,
    })
    // Return false to ensure all permissions run
    return false
  }
)
