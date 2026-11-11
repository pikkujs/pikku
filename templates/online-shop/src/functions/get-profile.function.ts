import { pikkuFunc } from '#pikku/function'

// @snippet start shopGetProfile
/**
 * The signed-in user's stored record, as opposed to the claims in their session.
 *
 * Profile fields live on Better Auth's `user` table — add your own through the
 * plugin's `additionalFields` rather than a second table beside it.
 */
export const getProfile = pikkuFunc({
  expose: true,
  description: "Read the signed-in user's stored profile row.",
  func: async ({ kysely }, _data, { session }) => {
    return kysely
      .selectFrom('user')
      .select(['id', 'name', 'email', 'role'])
      .where('id', '=', session.userId)
      .executeTakeFirstOrThrow()
  },
})
// @snippet end shopGetProfile
