import { pikkuPermission, pikkuPermissionFactory } from '#pikku'

export const permissionTagFactory = pikkuPermissionFactory((name: string) => {
  const permission = pikkuPermission(async ({ logger }, _data, { session }) => {
    logger.info({
      type: 'tag-permission',
      name,
      sessionExists: !!session,
    })
    return false
  })
  return permission
})

export const readTagPermission = pikkuPermission(
  async ({ logger }, _data, { session }) => {
    logger.info({
      type: 'tag-permission',
      name: 'read',
      sessionExists: !!session,
    })
    // Return false to ensure all permissions run
    return false
  }
)
