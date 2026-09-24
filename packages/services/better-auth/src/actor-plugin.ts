import * as z from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'
import {
  ACTOR_ROOT_SECRET_MIN_LENGTH,
  verifyActorSecret,
} from '@pikku/core/services'
import type { Logger } from '@pikku/core/services'

import {
  ACTOR_NOT_PROVISIONED_MESSAGE,
  ACTOR_SIGN_IN_DISABLED_MESSAGE,
  actorSignInAttemptRefusedMessage,
  actorSignInEnabledMessage,
  actorSignInNearMissMessage,
  actorSignInRefusedMessage,
  resolveActorSignIn,
  WEAK_ACTOR_ROOT_SECRET_MESSAGE,
  weakActorRootSecretMessage,
} from './actor-sign-in-gate.js'

export interface ActorPluginOptions {
  /**
   * The ROOT actor secret, from which each persona's own credential is derived
   * — it is not itself a valid credential and is never presented to the
   * endpoint. Missing or empty refuses the endpoint, and only `actor: true`
   * rows can sign in.
   */
  secret:
    | string
    | undefined
    | (() => string | undefined | Promise<string | undefined>)
  /**
   * The opt-in that enables sign-in outside `pikku dev`, when the caller has
   * already read it. Falls back to `process.env[ACTOR_SIGN_IN_OPT_IN_ENV]`.
   *
   * A Worker gets it as a binding rather than an environment variable, so a
   * stage deployed there passes `await variables.get(ACTOR_SIGN_IN_OPT_IN_ENV)`
   * here — the same call it already makes for its other deployment-supplied
   * configuration. Only `ACTOR_SIGN_IN_OPT_IN_VALUE` opens the gate; any other
   * value is refused and logged as a near miss, exactly as the environment
   * variable is.
   */
  allowSignIn?: string
  /** Defaults to `console`: `actor()` is wired inside `betterAuth({...})`, where the app's logger is often not in scope. */
  logger?: Pick<Logger, 'info' | 'warn'>
  /**
   * Upstream credentials an actor carries into its session, e.g. the token an
   * addon calls a third-party API with. Read at every sign-in from
   * `ACTOR_CREDENTIAL_<PERSONA>_<NAME>`, so a value never lives in code.
   */
  credentials?: ActorCredentialsOptions
}

export interface ActorCredentialsOptions {
  /** Credential names to look up, as the addon declares them (`defineCredential({ name })`). */
  names: string[]
  /** Persist one credential for the actor — typically `credentialService.set(name, value, userId)`. */
  store: (name: string, value: unknown, userId: string) => Promise<void>
  /** Defaults to `process.env`. A Worker passes `(key) => variables.get(key)`. */
  read?: (key: string) => string | undefined | Promise<string | undefined>
}

const envSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()

/** `dan@actors.local` + `dolibarr` → `ACTOR_CREDENTIAL_DAN_DOLIBARR`. */
export const actorCredentialEnvKey = (email: string, name: string) =>
  `ACTOR_CREDENTIAL_${envSegment(email.split('@')[0]!)}_${envSegment(name)}`

/** A JSON object is stored as-is; anything else is a bare token, stored as `{ token }`. */
export const parseActorCredential = (raw: string): unknown => {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      throw new Error('actor credential looks like JSON but does not parse')
    }
  }
  return { token: trimmed }
}

const storeActorCredentials = async (
  options: ActorCredentialsOptions,
  email: string,
  userId: string
): Promise<string[]> => {
  const read = options.read ?? ((key: string) => process.env[key])
  const stored: string[] = []
  for (const name of options.names) {
    const key = actorCredentialEnvKey(email, name)
    const raw = await read(key)
    if (!raw) continue
    let value: unknown
    try {
      value = parseActorCredential(raw)
    } catch (e) {
      throw new APIError('INTERNAL_SERVER_ERROR', {
        message: `${key}: ${(e as Error).message}`,
      })
    }
    await options.store(name, value, userId)
    stored.push(name)
  }
  return stored
}

/**
 * Better Auth plugin for scenario actors: `POST /sign-in/actor` with
 * `{ email, secret }`, non-actor sign-in refused, rows created only under
 * `pikku dev`.
 *
 * The presented secret is the address's own derived credential, not the root:
 * it verifies against the email being signed in as, so it opens that one
 * synthetic account and no other.
 */
export const pikkuActor = (options: ActorPluginOptions): BetterAuthPlugin => {
  const logger = options.logger ?? console
  const gate = resolveActorSignIn(options.allowSignIn)

  if (gate.nearMissOptIn) {
    logger.warn(actorSignInNearMissMessage())
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

          const root =
            typeof options.secret === 'function'
              ? await options.secret()
              : options.secret
          if (!root) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Actor sign-in is not configured',
            })
          }
          if (root.length < ACTOR_ROOT_SECRET_MIN_LENGTH) {
            logger.warn(weakActorRootSecretMessage())
            throw new APIError('UNAUTHORIZED', {
              message: WEAK_ACTOR_ROOT_SECRET_MESSAGE,
            })
          }

          type ActorUser = { id: string; actor?: boolean } & Record<
            string,
            unknown
          >
          const email = ctx.body.email.toLowerCase()
          if (!(await verifyActorSecret(root, email, ctx.body.secret))) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Invalid actor secret',
            })
          }
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
            if (!gate.mayProvision) {
              throw new APIError('UNAUTHORIZED', {
                message: ACTOR_NOT_PROVISIONED_MESSAGE,
              })
            }
            user = (await ctx.context.internalAdapter.createUser(
              {
                email,
                emailVerified: true,
                name: ctx.body.name ?? email.split('@')[0]!,
                actor: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              { method: 'actor' }
            )) as unknown as ActorUser | undefined
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
          if (options.credentials) {
            const stored = await storeActorCredentials(
              options.credentials,
              email,
              user.id
            )
            if (stored.length > 0) {
              logger.info(
                `actor ${email} carries upstream credentials: ${stored.join(', ')}`
              )
            }
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
