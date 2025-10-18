import { pikkuPermission } from '../../.pikku/pikku-types.gen.js'

export const httpGlobalPermission = pikkuPermission(
  async ({ logger }, _data, session) => {
    logger.info({
      type: 'http-permission',
      name: 'global',
      sessionExists: !!session,
    })
    // Return false to ensure all permissions run
    return false
  }
)

export const httpRoutePermission = pikkuPermission(
  async ({ logger }, _data, session) => {
    logger.info({
      type: 'http-permission',
      name: '/api/*',
      sessionExists: !!session,
    })
    // Return false to ensure all permissions run
    return false
  }
)
