import * as z from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'

export interface ActorPluginOptions {
  /**
   * The server-held impersonation secret (e.g. from a wired
   * `USER_FLOW_ACTOR_SECRET`). Sign-in only ever works for user rows flagged
   * `actor: true`, so knowing the secret never impersonates real users. A
   * missing/empty secret disables the endpoint entirely.
   */
  secret: string | undefined | (() => string | undefined | Promise<string | undefined>)
}

/** Length-hiding constant-time comparison — no early exit on mismatch. */
const secretsEqual = (a: string, b: string): boolean => {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  let diff = ab.length ^ bb.length
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  }
  return diff === 0
}

/**
 * Better Auth plugin for user-flow actors: synthetic users (an `actor`
 * boolean column on `user`) that pikkuUserFlow signs in via
 * `POST /sign-in/actor` with `{ email, secret }`. Actor rows are auto-created
 * on first sign-in; sign-in for a NON-actor user is always refused. The
 * `actor` flag rides on the user (and from there into the pikku core
 * session), so audits and analytics can address synthetic traffic.
 */
export const actor = (options: ActorPluginOptions): BetterAuthPlugin => {
  return {
    id: 'actor',
    schema: {
      user: {
        fields: {
          actor: {
            type: 'boolean',
            required: false,
            input: false,
            defaultValue: false,
          },
        },
      },
    },
    endpoints: {
      signInActor: createAuthEndpoint(
        '/sign-in/actor',
        {
          method: 'POST',
          body: z.object({
            email: z.string(),
            name: z.string().optional(),
            secret: z.string(),
          }),
        },
        async (ctx) => {
          const expected =
            typeof options.secret === 'function'
              ? await options.secret()
              : options.secret
          if (!expected) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Actor sign-in is not configured',
            })
          }
          if (!secretsEqual(ctx.body.secret, expected)) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Invalid actor secret',
            })
          }

          type ActorUser = { id: string; actor?: boolean } & Record<
            string,
            unknown
          >
          const email = ctx.body.email.toLowerCase()
          const existing =
            await ctx.context.internalAdapter.findUserByEmail(email)
          let user: ActorUser | undefined = existing?.user as
            | ActorUser
            | undefined
          if (user && !user.actor) {
            // Real user row — the secret must never impersonate real users
            throw new APIError('UNAUTHORIZED', {
              message: 'User is not an actor',
            })
          }
          if (!user) {
            user = (await ctx.context.internalAdapter.createUser({
              email,
              emailVerified: true,
              name: ctx.body.name ?? email.split('@')[0]!,
              actor: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            })) as unknown as ActorUser | undefined
            if (!user) {
              throw new APIError('INTERNAL_SERVER_ERROR', {
                message: 'Failed to create actor user',
              })
            }
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id
          )
          if (!session) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'Failed to create actor session',
            })
          }
          await setSessionCookie(ctx, { session, user: user as any })
          return ctx.json({ token: session.token, user: { id: user.id, email, actor: true } })
        }
      ),
    },
  }
}
