import {
  pikkuPermission,
  pikkuPermissionFactory,
} from '../../.pikku/pikku-types.gen.js'

export const permissionTagFactory = pikkuPermissionFactory((name: string) =>
  pikkuPermission(async ({ logger }, _data, { session }) => {
    const currentSession = await session.get()
    logger.info({
      type: 'tag-permission',
      name,
      sessionExists: !!currentSession,
    })
    // Return false to ensure all permissions run
    return false
  })
)

export const readTagPermission = pikkuPermission(
  async ({ logger }, _data, { session }) => {
    const currentSession = await session.get()
    logger.info({
      type: 'tag-permission',
      name: 'read',
      sessionExists: !!currentSession,
    })
    // Return false to ensure all permissions run
    return false
  }
)
