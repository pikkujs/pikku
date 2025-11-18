import { pikkuPermission } from '../../.pikku/pikku-types.gen.js'

export const functionPermission = pikkuPermission(
  async ({ logger }, _data, { initialSession }) => {
    logger.info({
      type: 'function-permission',
      name: 'function',
      sessionExists: !!initialSession,
    })
    // Return true to allow execution - this is the final permission check
    return true
  }
)
