import { pikkuAuth } from '#pikku/auth'

export const functionPermission = pikkuAuth({
  skipWithoutSession: true,
  func: async ({ logger }) => {
    logger.info({ type: 'function-permission', name: 'function' })
    // Return true to allow execution - this is the final permission check
    return true
  },
})
