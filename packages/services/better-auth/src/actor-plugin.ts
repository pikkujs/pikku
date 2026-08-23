import * as z from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'
import type { Logger } from '@pikku/core/services'

import {
  ACTOR_SIGN_IN_DISABLED_MESSAGE,
  actorSignInAttemptRefusedMessage,
  actorSignInEnabledMessage,
  actorSignInNearMissMessage,
  actorSignInRefusedMessage,
  resolveActorSignIn,
} from './actor-sign-in-gate.js'

export interface ActorPluginOptions {
  /** Impersonation secret; only `actor: true` rows can sign in, missing/empty refuses the endpoint. */
  secret:
    | string
    | undefined
    | (() => string | undefined | Promise<string | undefined>)
  /** Enable sign-in outside `pikku dev`, for a stage that exists to be exercised by scenarios. `PIKKU_ALLOW_ACTOR_SIGN_IN` does the same without a rebuild. */
  allowOutsideDev?: boolean
  /** Defaults to `console`: `actor()` is wired inside `betterAuth({...})`, where the app's logger is often not in scope. */
  logger?: Pick<Logger, 'info' | 'warn'>
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

/** Better Auth plugin for scenario actors: `POST /sign-in/actor` with `{ email, secret }`, actor rows auto-created, non-actor sign-in refused */
export const actor = (options: ActorPluginOptions): BetterAuthPlugin => {
  const logger = options.logger ?? console
  const gate = resolveActorSignIn(options.allowOutsideDev)

  if (gate.nearMissOptIn !== undefined) {
    logger.warn(actorSignInNearMissMessage(gate.nearMissOptIn))
  }
  if (gate.enabled) {
    logger.info(actorSignInEnabledMessage(gate.reason))
  }

  let refusalAnnounced = false
  if (!gate.enabled && typeof options.secret === 'string' && options.secret) {
    logger.warn(actorSignInRefusedMessage())
    refusalAnnounced = true
  }

  return {
    id: 'actor',
    /** Declared whether or not the gate is open — `pikku db generate` must never read a different shape in production than in development. */
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
          if (!gate.enabled) {
            if (!refusalAnnounced) {
              refusalAnnounced = true
              logger.warn(actorSignInAttemptRefusedMessage())
            }
            throw new APIError('UNAUTHORIZED', {
              message: ACTOR_SIGN_IN_DISABLED_MESSAGE,
            })
          }

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
            ActorUser | undefined
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
          return ctx.json({
            token: session.token,
            user: { id: user.id, email, actor: true },
          })
        }
      ),
    },
  }
}
