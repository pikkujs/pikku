import { pikkuAuth } from '#pikku'

export const isAuthenticated = pikkuAuth(async ({ logger }, session) => {
  logger.info({ type: 'auth-check' })
  return !!session
})

export const isAdmin = pikkuAuth({
  name: 'Admin Auth',
  description: 'Checks if user is an admin',
  func: async ({ logger }, session) => {
    logger.info({ type: 'admin-auth-check' })
    return (session as any)?.role === 'admin'
  },
})
