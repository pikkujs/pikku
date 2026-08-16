import { pikkuFunc } from '#pikku/function'
import { deleteAuthUser } from '@pikku/better-auth'
import { Success, UserRef } from '../lib/user.schemas.js'

export const removeUser = pikkuFunc({
  title: 'Remove User',
  description:
    'Permanently deletes a user along with their sessions and linked accounts. Cannot be undone.',
  expose: true,
  scopes: ['admin:users:remove'],
  input: UserRef,
  output: Success,
  func: async ({ auth }, { userId }, { session }) => {
    if (userId === session?.userId) {
      throw new Error('You cannot delete yourself')
    }
    await deleteAuthUser(auth, userId)
    return { success: true }
  },
})
