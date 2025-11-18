import { pikkuPermission } from '../../.pikku/pikku-types.gen.js'

export const functionPermission = pikkuPermission(
  async ({ logger }, _data, { session }) => {
    const currentSession = await session.get()
    logger.info({
      type: 'function-permission',
      name: 'function',
      sessionExists: !!currentSession,
    })
    // Return true to allow execution - this is the final permission check
    return true
  }
)
