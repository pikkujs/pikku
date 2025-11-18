import { pikkuPermission } from '../../.pikku/pikku-types.gen.js'

// Wire-level permission (will be in pikku-permissions.gen.ts because it's exported)
export const wirePermission = pikkuPermission(
  async ({ logger }, _data, { initialSession }) => {
    logger.info({
      type: 'wire-permission',
      name: 'wire',
      sessionExists: !!initialSession,
    })
    // Return false to ensure all permissions run
    return false
  }
)
