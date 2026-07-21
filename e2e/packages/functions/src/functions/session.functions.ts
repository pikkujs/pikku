import { pikkuFunc } from '#pikku/pikku-types.gen.js'

/**
 * Echoes the resolved session back to the caller. The impersonation suite uses
 * it to prove WHICH user a request actually ran as, without a browser: an
 * authorized admin sending the impersonation header runs as the target, while a
 * caller lacking `admin:impersonate` who forges the same header stays itself.
 */
export const whoAmI = pikkuFunc<
  void,
  { userId: string | undefined; scopes: string[] }
>({
  expose: true,
  func: async (_services, _data, { session }) => ({
    userId: session.userId,
    scopes: [...(session.scopes ?? [])],
  }),
})
