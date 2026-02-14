import { pikkuPermission } from '#pikku'

// Wire-level permission (will be in pikku-permissions.gen.ts because it's exported)
export const wirePermission = pikkuPermission(
  async ({ logger }, _data, { session }) => {
    logger.info({
      type: 'wire-permission',
      name: 'wire',
      sessionExists: !!session,
    })
    // Return false to ensure all permissions run
    return false
  }
)
