import * as z from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'
import {
  VIRTUAL_USER_ROOT_SECRET_MIN_LENGTH,
  verifyVirtualUserSecret,
} from '@pikku/core/services'
import type { FeatureFlagSource, Logger } from '@pikku/core/services'

import {
  VIRTUAL_USER_NOT_PROVISIONED_MESSAGE,
  VIRTUAL_USER_SIGN_IN_DISABLED_MESSAGE,
  virtualUserSignInAttemptRefusedMessage,
  virtualUserSignInEnabledMessage,
  virtualUserSignInNearMissMessage,
  virtualUserSignInRefusedMessage,
  resolveVirtualUserSignIn,
  WEAK_VIRTUAL_USER_ROOT_SECRET_MESSAGE,
  weakVirtualUserRootSecretMessage,
} from './virtual-user-sign-in-gate.js'
import {
  devSwitcherOn,
  isSignInable,
  listDevVirtualUsers,
} from './dev-virtual-users.js'
import type { DevSignInVirtualUser } from './dev-virtual-users.js'

export interface VirtualUserPluginOptions {
  /**
   * The ROOT virtual user secret, from which each virtual user's own credential is derived
   * — it is not itself a valid credential and is never presented to the
   * endpoint. Missing or empty refuses the endpoint, and only `virtualUser: true`
   * rows can sign in.
   */
  secret:
    | string
    | undefined
    | (() => string | undefined | Promise<string | undefined>)
  /**
   * The opt-in that enables sign-in outside `pikku dev`, when the caller has
   * already read it. Falls back to `process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV]`.
   *
   * A Worker gets it as a binding rather than an environment variable, so a
   * stage deployed there passes `await variables.get(VIRTUAL_USER_SIGN_IN_OPT_IN_ENV)`
   * here — the same call it already makes for its other deployment-supplied
   * configuration. Only `VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE` opens the gate; any other
   * value is refused and logged as a near miss, exactly as the environment
   * variable is.
   */
  allowSignIn?: string
  /**
   * Opens the "Sign in as …" switcher's two endpoints: `GET /sign-in/virtual-users
   * ?app=` lists the virtual users it may offer, and `POST /sign-in/switch-virtual-user { id }`
   * signs in as one without the caller presenting a credential.
   *
   * Open under `pikku dev`; a deployed stage needs `allowSignIn` and the
   * `devSwitcher` flag in `featureFlags`. `allowed` replaces that check.
   */
  virtualUserSignIn?: {
    virtualUsers: ReadonlyArray<DevSignInVirtualUser>
    featureFlags?: FeatureFlagSource
    allowed?: () => boolean | Promise<boolean>
  }
  /** Defaults to `console`: `virtualUser()` is wired inside `betterAuth({...})`, where the app's logger is often not in scope. */
  logger?: Pick<Logger, 'info' | 'warn'>
  /**
   * Upstream credentials a virtual user carries into its session, e.g. the token an
   * addon calls a third-party API with. Read at every sign-in from
   * `VIRTUAL_USER_CREDENTIAL_<VIRTUAL_USER>_<NAME>`, so a value never lives in code.
   */
  credentials?: VirtualUserCredentialsOptions
}

export interface VirtualUserCredentialsOptions {
  /** Credential names to look up, as the addon declares them (`defineCredential({ name })`). */
  names: string[]
  /** Persist one credential for the virtual user — typically `credentialService.set(name, value, userId)`. */
  store: (name: string, value: unknown, userId: string) => Promise<void>
  /** Drop one the environment no longer sets — typically `credentialService.delete(name, userId)`. */
  remove?: (name: string, userId: string) => Promise<void>
  /** Defaults to `process.env`. A Worker passes `(key) => variables.get(key)`. */
  read?: (key: string) => string | undefined | Promise<string | undefined>
}

const envSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()

/** `dan@virtualuser.local` + `dolibarr` → `VIRTUAL_USER_CREDENTIAL_DAN_DOLIBARR`. */
export const virtualUserCredentialEnvKey = (email: string, name: string) =>
  `VIRTUAL_USER_CREDENTIAL_${envSegment(email.split('@')[0]!)}_${envSegment(name)}`

/** A JSON object is stored as-is; anything else is a bare token, stored as `{ token }`. */
export const parseVirtualUserCredential = (raw: string): unknown => {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      throw new Error(
        'virtual user credential looks like JSON but does not parse'
      )
    }
  }
  return { token: trimmed }
}

const storeVirtualUserCredentials = async (
  options: VirtualUserCredentialsOptions,
  email: string,
  userId: string
): Promise<string[]> => {
  const read = options.read ?? ((key: string) => process.env[key])
  const stored: string[] = []
  for (const name of options.names) {
    const key = virtualUserCredentialEnvKey(email, name)
    const raw = await read(key)
    if (!raw) {
      await options.remove?.(name, userId)
      continue
    }
    let value: unknown
    try {
      value = parseVirtualUserCredential(raw)
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
 * Better Auth plugin for scenario virtual users: `POST /sign-in/virtual-user` with
 * `{ email, secret }`, non-virtual-user sign-in refused, rows created only under
 * `pikku dev`.
 *
 * The presented secret is the address's own derived credential, not the root:
 * it verifies against the email being signed in as, so it opens that one
 * synthetic account and no other.
 */
export const pikkuVirtualUser = (
  options: VirtualUserPluginOptions
): BetterAuthPlugin => {
  const logger = options.logger ?? console
  const gate = resolveVirtualUserSignIn(options.allowSignIn)

  if (gate.nearMissOptIn) {
    logger.warn(virtualUserSignInNearMissMessage())
  }
  if (gate.enabled) {
    logger.info(virtualUserSignInEnabledMessage(gate.reason))
  }

  let refusalAnnounced = false
  if (!gate.enabled && typeof options.secret === 'string' && options.secret) {
    logger.warn(virtualUserSignInRefusedMessage())
    refusalAnnounced = true
  }

  const virtualUserAllowed = async () =>
    options.virtualUserSignIn?.allowed
      ? options.virtualUserSignIn.allowed()
      : devSwitcherOn(
          options.virtualUserSignIn?.featureFlags,
          options.allowSignIn
        )

  const signIn = async (ctx: any, email: string, name?: string) => {
    type VirtualUserRow = { id: string; virtualUser?: boolean } & Record<
      string,
      unknown
    >
    const existing = await ctx.context.internalAdapter.findUserByEmail(email)
    let user: VirtualUserRow | undefined = existing?.user as
      VirtualUserRow | undefined
    if (user && !user.virtualUser) {
      // Real user row — the secret must never impersonate real users
      throw new APIError('UNAUTHORIZED', {
        message: 'User is not a virtual user',
      })
    }
    if (!user) {
      if (!gate.mayProvision) {
        throw new APIError('UNAUTHORIZED', {
          message: VIRTUAL_USER_NOT_PROVISIONED_MESSAGE,
        })
      }
      user = (await ctx.context.internalAdapter.createUser(
        {
          email,
          emailVerified: true,
          name: name ?? email.split('@')[0]!,
          virtualUser: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { method: 'virtualUser' }
      )) as unknown as VirtualUserRow | undefined
      if (!user) {
        throw new APIError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to create virtual user user',
        })
      }
    }

    const session = await ctx.context.internalAdapter.createSession(user.id)
    if (!session) {
      throw new APIError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to create virtual user session',
      })
    }
    if (options.credentials) {
      const stored = await storeVirtualUserCredentials(
        options.credentials,
        email,
        user.id
      )
      if (stored.length > 0) {
        logger.info(
          `virtualUser ${user.id} carries upstream credentials: ${stored.join(', ')}`
        )
      }
    }
    await setSessionCookie(ctx, { session, user: user as any })
    return ctx.json({
      token: session.token,
      user: { id: user.id, email, virtualUser: true },
    })
  }

  return {
    id: 'virtualUser',
    /** Declared whether or not the gate is open — `pikku db generate` must never read a different shape in production than in development. */
    schema: {
      user: {
        fields: {
          virtualUser: {
            type: 'boolean',
            required: false,
            input: false,
            defaultValue: false,
          },
        },
      },
    },
    endpoints: {
      signInWithEmail: createAuthEndpoint(
        '/sign-in/virtual-user',
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
              logger.warn(virtualUserSignInAttemptRefusedMessage())
            }
            throw new APIError('UNAUTHORIZED', {
              message: VIRTUAL_USER_SIGN_IN_DISABLED_MESSAGE,
            })
          }

          const root =
            typeof options.secret === 'function'
              ? await options.secret()
              : options.secret
          if (!root) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Virtual user sign-in is not configured',
            })
          }
          if (root.length < VIRTUAL_USER_ROOT_SECRET_MIN_LENGTH) {
            logger.warn(weakVirtualUserRootSecretMessage())
            throw new APIError('UNAUTHORIZED', {
              message: WEAK_VIRTUAL_USER_ROOT_SECRET_MESSAGE,
            })
          }

          const email = ctx.body.email.toLowerCase()
          if (!(await verifyVirtualUserSecret(root, email, ctx.body.secret))) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Invalid virtual user secret',
            })
          }
          return signIn(ctx, email, ctx.body.name)
        }
      ),
      ...(options.virtualUserSignIn
        ? {
            listVirtualUsers: createAuthEndpoint(
              '/sign-in/virtual-users',
              {
                method: 'GET',
                query: z.object({ app: z.string().optional() }).optional(),
              },
              async (ctx) => {
                const virtualUserSignIn = options.virtualUserSignIn!
                const open = gate.enabled && (await virtualUserAllowed())
                return ctx.json({
                  virtualUsers: open
                    ? listDevVirtualUsers(
                        virtualUserSignIn.virtualUsers,
                        ctx.query?.app
                      )
                    : [],
                })
              }
            ),
            signInVirtualUser: createAuthEndpoint(
              '/sign-in/switch-virtual-user',
              { method: 'POST', body: z.object({ id: z.string() }) },
              async (ctx) => {
                const virtualUserSignIn = options.virtualUserSignIn!
                if (!gate.enabled || !(await virtualUserAllowed())) {
                  throw new APIError('UNAUTHORIZED', {
                    message: 'Virtual user sign-in is disabled',
                  })
                }
                const virtualUser = virtualUserSignIn.virtualUsers.find(
                  (candidate) =>
                    candidate.id === ctx.body.id && isSignInable(candidate)
                )
                if (!virtualUser?.email) {
                  throw new APIError('NOT_FOUND', {
                    message: `No virtual user '${ctx.body.id}'`,
                  })
                }
                return signIn(
                  ctx,
                  virtualUser.email.toLowerCase(),
                  virtualUser.name
                )
              }
            ),
          }
        : {}),
    },
  }
}
