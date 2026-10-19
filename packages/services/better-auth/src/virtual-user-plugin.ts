import * as z from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'
import {
  VIRTUAL_USER_IN_PROCESS_ENDPOINT,
  VirtualUserStatementError,
} from '@pikku/core/services'
import type {
  FeatureFlagSource,
  Logger,
  VirtualUserStatementVerifier,
} from '@pikku/core/services'

import { JoseVirtualUserStatementVerifier } from '@pikku/jose'
import {
  VIRTUAL_USER_NO_VERIFY_KEY_MESSAGE,
  VIRTUAL_USER_NOT_PROVISIONED_MESSAGE,
  VIRTUAL_USER_SIGN_IN_DISABLED_MESSAGE,
  virtualUserSignInEnabledMessage,
  virtualUserSignInNearMissMessage,
  resolveVirtualUserSignIn,
} from './virtual-user-sign-in-gate.js'
import {
  devSwitcherOn,
  isSignInable,
  listDevVirtualUsers,
} from './dev-virtual-users.js'
import type { DevSignInVirtualUser } from './dev-virtual-users.js'
import { grantVirtualUserAccess } from './provision-virtual-users.js'
import type { ProvisionVirtualUsersServices } from './provision-virtual-users.js'

/** Options for {@link pikkuVirtualUser}. */
export interface VirtualUserPluginOptions {
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
   *
   * With the gate shut the plugin registers no sign-in endpoint at all.
   */
  allowSignIn?: string
  /**
   * The stage's virtual user public key, as the variable
   * `VIRTUAL_USER_VERIFY_KEY` holds it. Statements from outside the app are
   * checked against it. Without a key (or a `statementVerifier`) there is no
   * statement endpoint, and the switcher is open under `pikku dev` only.
   */
  verifyKey?: string
  /** A verifier of your own, for a key held somewhere other than a variable. */
  statementVerifier?: VirtualUserStatementVerifier
  /**
   * The audience a statement must name. Defaults to the origin of the auth
   * base URL; set it for an app behind a proxy that rewrites the origin.
   */
  audience?: string
  /**
   * The declared virtual users. `POST /sign-in/virtual-user { statement }`
   * resolves the statement's virtual user id against it, and the "Sign in as …"
   * switcher lists and signs in from it:
   * `GET /sign-in/virtual-users?app=` lists what it may offer and
   * `POST /sign-in/switch-virtual-user { id, statement? }` signs in as one.
   *
   * The switcher is open under `pikku dev`; a deployed stage needs `allowSignIn`
   * and the `devSwitcher` flag in `featureFlags` (`allowed` replaces that
   * check), and every switch there carries a statement.
   */
  virtualUserSignIn?: {
    virtualUsers: ReadonlyArray<DevSignInVirtualUser>
    featureFlags?: FeatureFlagSource
    allowed?: () => boolean | Promise<boolean>
  }
  /**
   * The app's scope service. Under `pikku dev`, where sign-in creates virtual
   * user accounts on demand, each sign-in also grants the app scope and roles the
   * virtual user declares (additively, never revoking). A deployed stage leaves
   * this to `provisionVirtualUsers`.
   */
  scopeService?: ProvisionVirtualUsersServices['scopeService']
  /** Defaults to `console`: `virtualUser()` is wired inside `betterAuth({...})`, where the app's logger is often not in scope. */
  logger?: Pick<Logger, 'info' | 'warn'>
  /**
   * Upstream credentials a virtual user carries into its session, e.g. the token an
   * addon calls a third-party API with. Read at every sign-in from
   * `VIRTUAL_USER_CREDENTIAL_<LOCAL_PART>_<NAME>`, so a value never lives in code.
   * `<LOCAL_PART>` is the part of the virtual user's email before the `@` (the
   * domain is not read), and both it and `<NAME>` are uppercased with each run of
   * non-alphanumeric characters replaced by a single `_`.
   */
  credentials?: VirtualUserCredentialsOptions
}

/**
 * Upstream credentials a virtual user carries, read from
 * `VIRTUAL_USER_CREDENTIAL_<LOCAL_PART>_<NAME>` variables at each sign-in, where
 * `<LOCAL_PART>` is the email before the `@`. See {@link virtualUserCredentialEnvKey}.
 */
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

/**
 * The variable a virtual user's credential is read from. Only the email's local
 * part is used, never the domain; the local part and the credential name are each
 * uppercased with runs of non-alphanumeric characters replaced by `_`.
 *
 * `dan@virtualuser.local` + `dolibarr` → `VIRTUAL_USER_CREDENTIAL_DAN_DOLIBARR`.
 * `a.b-c@x.test` + `my token` → `VIRTUAL_USER_CREDENTIAL_A_B_C_MY_TOKEN`.
 */
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
 * Better Auth plugin for virtual users. One sign-in closure is the only thing
 * that creates a virtual user session; three endpoints reach it:
 *
 * - `signInVirtualUserInternal`, `SERVER_ONLY`: not routable over HTTP, called
 *   through `auth.api` by a run that is already inside the app.
 * - `POST /sign-in/virtual-user { statement }`: an external caller's signed
 *   statement, checked against the stage's public key.
 * - `POST /sign-in/switch-virtual-user { id, statement? }`: the switcher.
 *
 * Non-virtual-user rows are refused, and rows are created only under
 * `pikku dev`. With the gate shut none of the sign-in endpoints is registered:
 * production has no route to refuse and no handler to reach.
 *
 * @example snippet: betterAuthConfig
 */
export const pikkuVirtualUser = (
  options: VirtualUserPluginOptions = {}
): BetterAuthPlugin => {
  const logger = options.logger ?? console
  const gate = resolveVirtualUserSignIn(options.allowSignIn)
  const statementVerifier =
    options.statementVerifier ??
    (options.verifyKey
      ? new JoseVirtualUserStatementVerifier(options.verifyKey)
      : undefined)

  if (gate.nearMissOptIn) {
    logger.warn(virtualUserSignInNearMissMessage())
  }
  if (gate.enabled) {
    logger.info(virtualUserSignInEnabledMessage(gate.reason))
    if (options.virtualUserSignIn && !statementVerifier) {
      logger.warn(VIRTUAL_USER_NO_VERIFY_KEY_MESSAGE)
    }
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

    const declaration = options.virtualUserSignIn?.virtualUsers.find(
      (candidate) => candidate.email?.toLowerCase() === email
    )
    if (gate.mayProvision && options.scopeService && declaration) {
      await grantVirtualUserAccess(options.scopeService, user.id, declaration)
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

  const verifyStatement = async (ctx: any, statement: string) => {
    if (!statementVerifier) {
      throw new APIError('UNAUTHORIZED', {
        message:
          'This app has no verify key for virtual user statements — set the VIRTUAL_USER_VERIFY_KEY variable and pass it to pikkuVirtualUser as verifyKey',
      })
    }
    const audience =
      options.audience ?? new URL(ctx.context.baseURL as string).origin
    try {
      return await statementVerifier.verify(statement, audience)
    } catch (error) {
      if (error instanceof VirtualUserStatementError) {
        throw new APIError('UNAUTHORIZED', { message: error.message })
      }
      throw error
    }
  }

  const declared = (id: string) =>
    options.virtualUserSignIn?.virtualUsers.find(
      (candidate) => candidate.id === id && isSignInable(candidate)
    )

  const endpoints: NonNullable<BetterAuthPlugin['endpoints']> = {}

  if (gate.enabled) {
    endpoints[VIRTUAL_USER_IN_PROCESS_ENDPOINT] = createAuthEndpoint(
      '/sign-in/virtual-user-internal',
      {
        method: 'POST',
        body: z.object({ email: z.string(), name: z.string().optional() }),
        metadata: { SERVER_ONLY: true },
      },
      async (ctx) => signIn(ctx, ctx.body.email.toLowerCase(), ctx.body.name)
    )

    if (statementVerifier && options.virtualUserSignIn) {
      endpoints.signInWithStatement = createAuthEndpoint(
        '/sign-in/virtual-user',
        { method: 'POST', body: z.object({ statement: z.string() }) },
        async (ctx) => {
          const { virtualUserId } = await verifyStatement(
            ctx,
            ctx.body.statement
          )
          const virtualUser = declared(virtualUserId)
          if (!virtualUser?.email) {
            throw new APIError('NOT_FOUND', {
              message: `No virtual user '${virtualUserId}'`,
            })
          }
          return signIn(ctx, virtualUser.email.toLowerCase(), virtualUser.name)
        }
      )
    }
  }

  if (options.virtualUserSignIn) {
    endpoints.listVirtualUsers = createAuthEndpoint(
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
    )
    endpoints.signInVirtualUser = createAuthEndpoint(
      '/sign-in/switch-virtual-user',
      {
        method: 'POST',
        body: z.object({ id: z.string(), statement: z.string().optional() }),
      },
      async (ctx) => {
        if (!gate.enabled || !(await virtualUserAllowed())) {
          throw new APIError('UNAUTHORIZED', {
            message: VIRTUAL_USER_SIGN_IN_DISABLED_MESSAGE,
          })
        }
        const virtualUser = declared(ctx.body.id)
        if (!virtualUser?.email) {
          throw new APIError('NOT_FOUND', {
            message: `No virtual user '${ctx.body.id}'`,
          })
        }
        if (!gate.mayProvision) {
          if (!ctx.body.statement) {
            throw new APIError('UNAUTHORIZED', {
              message:
                'Signing in as a virtual user on a stage needs a signed statement',
            })
          }
          const { virtualUserId } = await verifyStatement(
            ctx,
            ctx.body.statement
          )
          if (virtualUserId !== ctx.body.id) {
            throw new APIError('UNAUTHORIZED', {
              message: 'The statement is for a different virtual user',
            })
          }
        }
        return signIn(ctx, virtualUser.email.toLowerCase(), virtualUser.name)
      }
    )
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
    endpoints,
  }
}
