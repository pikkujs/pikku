import { pikkuAuth } from '#pikku/auth'

/** The app's own rule on applications, which can only narrow the scopes. */
export const handlesApplications = pikkuAuth(
  async (_services, session) => session.userId !== 'outsider'
)
