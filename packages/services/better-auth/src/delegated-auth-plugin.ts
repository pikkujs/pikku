import * as z from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'
import type { Logger, ScopeService } from '@pikku/core/services'

/** providerId of the account row that keys a delegated identity to its upstream. */
export const DELEGATED_PROVIDER_ID = 'delegated'

/**
 * What the end-user typed at sign-in — forwarded verbatim to
 * {@link DelegatedAuthOptions.authenticate}, never stored.
 */
export interface DelegatedCredentials {
  email?: string
  password?: string
  apiKey?: string
}

/** Identity claims (+ upstream token) returned by a successful upstream login. */
export interface UpstreamIdentity {
  /** Stable id in the upstream system (e.g. its user `_id`). */
  externalId: string
  email: string
  name?: string
  /** Upstream role; mapped via {@link DelegatedAuthOptions.mapRole} when set. */
  role?: string
  /** Upstream tenant (informational; travels inside `credential`). */
  tenantId?: string
  /**
   * Opaque credential for calling the upstream AS this user (convention:
   * `{ token, expiresAt?, tenantId? }`). Persisted via
   * {@link DelegatedAuthOptions.storeCredential}, never returned to the client.
   */
  credential: unknown
}

export interface DelegatedAuthOptions {
  /**
   * Verify the credentials against THE upstream system of record (exactly one
   * per app — additional imported APIs are linked integrations, not extra
   * login methods). Return null on rejection; throwing is treated as
   * rejection and logged server-side without leaking upstream detail.
   */
  authenticate: (
    credentials: DelegatedCredentials
  ) => Promise<UpstreamIdentity | null>
  /**
   * Persist `identity.credential` for `userId` (typically
   * `credentialService.set('<addon>', identity.credential, userId)`). Runs
   * BEFORE the session is created — a sign-in whose upstream token failed to
   * persist fails outright, since every proxied call would be dead anyway.
   */
  storeCredential: (userId: string, identity: UpstreamIdentity) => Promise<void>
  /** Role when the identity carries none. Must exist in the ScopeService. */
  defaultRole?: string
  /** Map an upstream role onto an app role; default: pass-through. */
  mapRole?: (upstreamRole: string) => string | undefined
  /**
   * Where a resolved role is granted. Roles are pikku's — a named bag of
   * scopes — so the grant lands in `pikku_user_role`, not on a `role` column.
   * Without one, a resolved role is dropped with a warning.
   */
  scopeService?: ScopeService
  /** Logger for role-grant warnings. */
  logger?: Logger
}

/**
 * Grants `role` to `userId` unless already held.
 *
 * Never throws: an upstream role the app has not defined is a provisioning gap,
 * and failing the whole sign-in over it would lock the user out of an app they
 * just proved they can access. The user simply signs in without that role.
 */
const grantRole = async (
  options: DelegatedAuthOptions,
  userId: string,
  role: string | undefined
): Promise<void> => {
  if (!role) {
    return
  }
  if (!options.scopeService) {
    options.logger?.warn?.(
      `delegated sign-in: no ScopeService registered, so role '${role}' was not granted to ${userId}`
    )
    return
  }
  try {
    const held = await options.scopeService.listUserRoles(userId)
    if (!held.includes(role)) {
      await options.scopeService.addUserToRole(userId, role)
    }
  } catch (error) {
    options.logger?.warn?.(
      `delegated sign-in: could not grant role '${role}' to ${userId}: ${error}`
    )
  }
}

/**
 * Better Auth plugin for delegated login: the imported upstream API is itself
 * the identity provider. `POST /sign-in/delegated` forwards the user's
 * EXISTING upstream credentials to {@link DelegatedAuthOptions.authenticate};
 * on success it JIT-provisions a real user row (email-keyed, emailVerified —
 * the upstream just verified those credentials) linked to the upstream via an
 * `account` row (`providerId: 'delegated'`, `accountId: externalId`), persists
 * the upstream token per-user, and mints a normal session. Passwords are never
 * stored; the name is refreshed on every sign-in, and the resolved role is
 * re-granted through the {@link DelegatedAuthOptions.scopeService}.
 */
export const delegatedAuth = (
  options: DelegatedAuthOptions
): BetterAuthPlugin => ({
  id: 'delegated-auth',
  endpoints: {
    signInDelegated: createAuthEndpoint(
      '/sign-in/delegated',
      {
        method: 'POST',
        body: z.object({
          email: z.string().optional(),
          password: z.string().optional(),
          apiKey: z.string().optional(),
        }),
      },
      async (ctx) => {
        const { email, password, apiKey } = ctx.body
        if (!apiKey && !(email && password)) {
          throw new APIError('BAD_REQUEST', {
            message: 'Provide email and password, or an apiKey',
          })
        }

        let identity: UpstreamIdentity | null = null
        try {
          identity = await options.authenticate({ email, password, apiKey })
        } catch (error) {
          // Upstream failures must not leak detail to the caller; treat as rejection.
          ctx.context.logger.error('delegated sign-in: authenticate threw', {
            error,
          })
          identity = null
        }
        if (!identity || !identity.externalId || !identity.email) {
          throw new APIError('UNAUTHORIZED', {
            message: 'Invalid upstream credentials',
          })
        }

        const role = identity.role
          ? (options.mapRole?.(identity.role) ?? identity.role)
          : options.defaultRole
        const identityEmail = identity.email.toLowerCase()
        const adapter = ctx.context.internalAdapter

        type AppUser = { id: string; email: string } & Record<string, unknown>
        let user: AppUser | undefined

        const account = await adapter.findAccountByProviderId(
          identity.externalId,
          DELEGATED_PROVIDER_ID
        )
        if (account) {
          const found = (await adapter.findUserById(
            account.userId
          )) as AppUser | null
          if (!found) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'Delegated account has no user',
            })
          }
          // Refresh mutable claims. The email is deliberately left alone — an
          // upstream email change must not collide with another local row.
          user = (await adapter.updateUser(found.id, {
            ...(identity.name ? { name: identity.name } : {}),
          })) as AppUser
        } else {
          const existing = await adapter.findUserByEmail(identityEmail, {
            includeAccounts: true,
          })
          if (existing) {
            const existingUser = existing.user as AppUser
            // Never attach a delegated identity to synthetic operator/actor rows.
            if (existingUser.fabric === true || existingUser.actor === true) {
              throw new APIError('UNAUTHORIZED', {
                message: 'User cannot sign in with upstream credentials',
              })
            }
            // Email row already bound to a DIFFERENT upstream user (same
            // accountId would have matched findAccountByProviderId above).
            const conflicting = existing.accounts.find(
              (a) => a.providerId === DELEGATED_PROVIDER_ID
            )
            if (conflicting) {
              throw new APIError('UNAUTHORIZED', {
                message: 'Email is linked to a different upstream user',
              })
            }
            user = (await adapter.updateUser(existingUser.id, {
              ...(identity.name ? { name: identity.name } : {}),
            })) as AppUser
          } else {
            user = (await adapter.createUser({
              email: identityEmail,
              emailVerified: true,
              name: identity.name ?? identityEmail.split('@')[0]!,
              createdAt: new Date(),
              updatedAt: new Date(),
            })) as unknown as AppUser
            if (!user) {
              throw new APIError('INTERNAL_SERVER_ERROR', {
                message: 'Failed to create user',
              })
            }
          }
          await adapter.linkAccount({
            providerId: DELEGATED_PROVIDER_ID,
            accountId: identity.externalId,
            userId: user.id,
          })
        }

        await grantRole(options, user.id, role)

        // Persist the upstream token BEFORE minting the session — without it
        // every proxied call would fail, so the sign-in must fail instead.
        try {
          await options.storeCredential(user.id, identity)
        } catch (error) {
          ctx.context.logger.error(
            'delegated sign-in: failed to store upstream credential',
            { error }
          )
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'Failed to store upstream credential',
          })
        }

        const session = await adapter.createSession(user.id)
        if (!session) {
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'Failed to create session',
          })
        }
        await setSessionCookie(ctx, { session, user: user as any })
        return ctx.json({
          token: session.token,
          user: { id: user.id, email: user.email },
        })
      }
    ),
  },
})
