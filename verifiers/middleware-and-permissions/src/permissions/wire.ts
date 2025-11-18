import { pikkuPermission } from '../../.pikku/pikku-types.gen.js'

// Wire-level permission (will be in pikku-permissions.gen.ts because it's exported)
export const wirePermission = pikkuPermission(
  async ({ logger }, _data, { session }) => {
    const currentSession = await session.get()
    logger.info({
      type: 'wire-permission',
      name: 'wire',
      sessionExists: !!currentSession,
    })
    // Return false to ensure all permissions run
    return false
  }
)
