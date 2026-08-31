import { APIError } from 'better-auth/api'
import type { BetterAuthPlugin } from 'better-auth'

export interface BanPluginOptions {
  /** Message returned to a banned user attempting to sign in. */
  message?: string
}

const DEFAULT_MESSAGE =
  'You have been banned from this application. Please contact support if you believe this is an error.'

/**
 * The ban half of better-auth's `admin()` plugin, without the rest of it.
 *
 * `admin()` bundles three unrelated things: a `role` column, fifteen HTTP
 * endpoints authorized against that column, and the enforcement that stops a
 * banned user from getting a session. Pikku authorizes with scopes and exposes
 * user management as its own RPCs, so the first two were dead weight carried
 * only to reach the third — and the `role` column actively fought the scope
 * model, since it had to be kept in sync with grants it never actually decided.
 *
 * What is left here is enforcement and nothing else: the three columns a ban
 * lives in, and a session hook that refuses one. It makes no authorization
 * decision of its own — who may ban is decided by the `admin:users:ban` scope on
 * the RPC — so it never needs to know about scopes, roles, or the caller.
 *
 * An expired ban lapses on the next sign-in attempt rather than being swept: the
 * only moment the value matters is the moment a session is created, so that is
 * where it is settled.
 */
/**
 * The plugin's id, exported because callers that write the `banned` column have
 * to know whether the column exists — `ctx.hasPlugin(BAN_PLUGIN_ID)`.
 */
export const BAN_PLUGIN_ID = 'pikku-ban'

export const pikkuBan = (options: BanPluginOptions = {}): BetterAuthPlugin => ({
  id: BAN_PLUGIN_ID,
  schema: {
    user: {
      fields: {
        banned: {
          type: 'boolean',
          required: false,
          input: false,
          defaultValue: false,
        },
        banReason: { type: 'string', required: false, input: false },
        banExpires: { type: 'date', required: false, input: false },
      },
    },
  },
  init() {
    return {
      options: {
        databaseHooks: {
          session: {
            create: {
              async before(session: any, ctx: any) {
                if (!ctx) {
                  return
                }
                const user = await ctx.context.internalAdapter.findUserById(
                  session.userId
                )
                if (!user?.banned) {
                  return
                }
                if (
                  user.banExpires &&
                  new Date(user.banExpires).getTime() < Date.now()
                ) {
                  await ctx.context.internalAdapter.updateUser(session.userId, {
                    banned: false,
                    banReason: null,
                    banExpires: null,
                  })
                  return
                }
                throw new APIError('FORBIDDEN', {
                  message: options.message ?? DEFAULT_MESSAGE,
                  code: 'BANNED_USER',
                })
              },
            },
          },
        },
      },
    }
  },
})
