import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from 'better-auth/api'
import { genericOAuth } from 'better-auth/plugins'
import {
  createAuthorizationURL,
  generateState,
  parseState,
  setTokenUtil,
} from 'better-auth/oauth2'
import * as z from 'zod'
import type { Logger } from '@pikku/core/services'
import type { ScopeService } from '@pikku/core/services'
import type { CredentialOAuthProvider } from './credential-oauth-providers.js'
import { ADMIN_SCOPES, resolvedUserHoldsScopes } from './auth-scopes.js'

const CALLBACK_PATH = '/credential-oauth/callback'

/**
 * Owner of every `type: 'singleton'` credential. A platform credential belongs
 * to the app, not to whoever happened to click Connect — but better-auth keys
 * accounts by user, so the platform needs a user to be. Reserved and never
 * sign-in-able: it is created with no credential account of any kind, so no
 * sign-in method can resolve it. Account rows hang off it exactly like a real
 * user's, so storage, refresh and unlink are the same code path.
 *
 * This is the id the row is *asked* for. Under `advanced.database.generateId:
 * 'uuid' | 'serial'` better-auth assigns its own, so the row is always found by
 * {@link PLATFORM_USER_EMAIL} — see {@link findPlatformUserId}.
 */
export const PLATFORM_USER_ID = 'pikku-platform'

/** The reserved address the platform user is found by, whatever its id. */
export const PLATFORM_USER_EMAIL = 'platform@pikku.internal'

/**
 * Thrown by {@link findPlatformUserId} when {@link PLATFORM_USER_EMAIL} belongs
 * to a user who can sign in with a password, which the platform user never can.
 */
export class ReservedPlatformEmailError extends Error {
  constructor() {
    super(
      `${PLATFORM_USER_EMAIL} is reserved for the platform user but belongs to a user with a password, so it is not treated as the platform user. Remove that user.`
    )
    this.name = 'ReservedPlatformEmailError'
  }
}

/**
 * The platform user's actual row id, or `null` before the first singleton
 * credential has been linked.
 *
 * The row is created on demand, so until then the reserved address is free to
 * sign up with. A match is therefore not proof of ownership: a user holding an
 * email-and-password account is someone who took the address, and binding every
 * singleton credential to them would hand them the app's tokens.
 *
 * @param internalAdapter - better-auth's `$context.internalAdapter`.
 * @throws {ReservedPlatformEmailError} when the address belongs to a user with a
 * password account.
 */
export const findPlatformUserId = async (internalAdapter: {
  findUserByEmail: (email: string) => Promise<{ user: { id: string } } | null>
  findAccounts: (userId: string) => Promise<Array<{ providerId: string }>>
}): Promise<string | null> => {
  const found = await internalAdapter.findUserByEmail(PLATFORM_USER_EMAIL)
  if (!found) {
    return null
  }
  const accounts = await internalAdapter.findAccounts(found.user.id)
  if (accounts.some((account) => account.providerId === 'credential')) {
    throw new ReservedPlatformEmailError()
  }
  return found.user.id
}

/** Options for {@link pikkuCredentialOAuth}. */
export interface CredentialOAuthOptions {
  /** Built by `credentialOAuthProviders(CREDENTIAL_OAUTH2_CONFIGS, secrets)`. */
  config: CredentialOAuthProvider[]
  /**
   * Resolves the caller's scopes for the default {@link canLinkSingleton}
   * gate. Pass the app's registered `ScopeService`; without it the default
   * gate denies every singleton link.
   */
  scopeService?: ScopeService
  /** Logger for the default gate's configuration warnings. */
  logger?: Logger
  /**
   * Decides who may connect a `type: 'singleton'` credential — it rebinds the
   * token for EVERY user, so this cannot be left to any signed-in caller.
   * Defaults to requiring the `admin:credentials:link` scope.
   */
  canLinkSingleton?: (
    session: CredentialOAuthSession
  ) => boolean | Promise<boolean>
}

/** The caller {@link CredentialOAuthOptions.canLinkSingleton} is asked about. */
export interface CredentialOAuthSession {
  user: {
    id: string
    name?: string | null
    email?: string | null
  }
}

/**
 * Links OAuth2 *credentials* — API access tokens — to a user, storing them in
 * better-auth's `account` table so `auth.api.getAccessToken()` refreshes them
 * on read.
 *
 * Why not `genericOAuth`'s own `/oauth2/link`: that flow models an *identity
 * provider*. Its callback demands a userinfo response (id + email + name),
 * keys the account row on `accountId = userInfo.id`, and refuses to link
 * unless the provider's email matches the user's — relaxable only via the
 * global `allowDifferentEmails`, which better-auth itself flags as an
 * account-takeover risk. A credential is not an identity: most credential
 * providers expose only `/authorize` and `/token`, and a synthesized identity
 * cannot work either, because a constant `accountId` lets exactly one user in
 * the system link a given credential while a random one orphans the previous
 * token on every re-link.
 *
 * So the account is identified by the only thing that is actually meaningful
 * here — *whose* credential it is: `accountId` is the linking user's id, making
 * (providerId, userId) unique by construction and skipping userinfo entirely.
 *
 * Everything else is still better-auth's: this wraps `genericOAuth` to keep its
 * provider registration (`context.socialProviders`), which is what supplies the
 * token exchange and the `refreshAccessToken` that `getAccessToken` calls. Only
 * the two identity-bound endpoints are replaced.
 *
 * @example snippet: betterAuthCredentialOAuth
 */
export const pikkuCredentialOAuth = (options: CredentialOAuthOptions) => {
  const base = genericOAuth({ config: options.config })
  const findConfig = (providerId: string) =>
    options.config.find((provider) => provider.providerId === providerId)
  const canLinkSingleton =
    options.canLinkSingleton ??
    ((session: CredentialOAuthSession) =>
      resolvedUserHoldsScopes(
        session.user.id,
        [ADMIN_SCOPES.credentialsLink],
        options.scopeService,
        options.logger
      ))

  /**
   * Created on demand rather than at startup: an app with no singleton
   * credentials should never grow a user row it does not use.
   */
  const ensurePlatformUser = async (ctx: any): Promise<string> => {
    const adapter = ctx.context.internalAdapter
    let existing: string | null
    try {
      existing = await findPlatformUserId(adapter)
    } catch (error) {
      if (error instanceof ReservedPlatformEmailError) {
        throw new APIError('CONFLICT', {
          message: error.message,
          code: 'PLATFORM_USER_RESERVED',
        })
      }
      throw error
    }
    if (existing) {
      return existing
    }
    const created = await adapter.createUser(
      {
        id: PLATFORM_USER_ID,
        email: PLATFORM_USER_EMAIL,
        name: 'Platform',
        emailVerified: false,
      },
      { method: 'credential-oauth' }
    )
    return created.id
  }

  const link = createAuthEndpoint(
    '/credential-oauth/link',
    {
      method: 'POST',
      body: z.object({
        providerId: z.string(),
        callbackURL: z.string().optional(),
      }),
      use: [sessionMiddleware],
      metadata: {
        openapi: {
          description: 'Start linking an OAuth2 credential to the current user',
        },
      },
    },
    async (ctx) => {
      const session = ctx.context.session
      if (!session) {
        throw new APIError('UNAUTHORIZED', {
          message: 'A session is required to link a credential',
          code: 'SESSION_REQUIRED',
        })
      }
      const config = findConfig(ctx.body.providerId)
      if (!config) {
        throw new APIError('NOT_FOUND', {
          message: `No OAuth2 credential named '${ctx.body.providerId}' is declared`,
          code: 'PROVIDER_NOT_FOUND',
        })
      }

      // A singleton credential is the platform's, so it hangs off the reserved
      // platform user rather than whoever clicked Connect — otherwise it would
      // silently become that person's, and vanish when they unlinked it.
      let ownerId = session.user.id
      if (config.type === 'singleton') {
        if (!(await canLinkSingleton(session))) {
          throw new APIError('FORBIDDEN', {
            message: `Connecting '${config.providerId}' rebinds it for every user — that is an admin action`,
            code: 'SINGLETON_LINK_FORBIDDEN',
          })
        }
        ownerId = await ensurePlatformUser(ctx)
      }

      // Carries the owner through the redirect; the callback trusts this signed
      // state rather than the (cross-site) callback request's cookies.
      const state = await generateState(ctx, {
        link: { userId: ownerId, email: session.user.email },
      })

      const redirectURI = `${ctx.context.baseURL}${CALLBACK_PATH}/${config.providerId}`
      const url = await createAuthorizationURL({
        id: config.providerId,
        options: {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectURI,
        },
        authorizationEndpoint: config.authorizationUrl,
        state: state.state,
        codeVerifier: config.pkce ? state.codeVerifier : undefined,
        scopes: config.scopes ?? [],
        scopeJoiner: config.scopeSeparator,
        redirectURI,
        // access_type=offline / duration=permanent — without these the provider
        // never issues the refresh token that getAccessToken relies on.
        additionalParams: config.authorizationUrlParams,
      })

      return ctx.json({ url: url.toString(), redirect: true })
    }
  )

  const callback = createAuthEndpoint(
    `${CALLBACK_PATH}/:providerId`,
    {
      method: 'GET',
      query: z
        .object({
          code: z.string().optional(),
          error: z.string().optional(),
          state: z.string().optional(),
        })
        .optional(),
    },
    async (ctx) => {
      const providerId = ctx.params?.providerId
      const config = providerId ? findConfig(providerId) : undefined
      if (!providerId || !config) {
        throw new APIError('NOT_FOUND', {
          message: `No OAuth2 credential named '${providerId}' is declared`,
          code: 'PROVIDER_NOT_FOUND',
        })
      }

      const parsedState = await parseState(ctx)
      const {
        callbackURL,
        codeVerifier,
        errorURL,
        link: linkState,
      } = parsedState
      const onError = (code: string) =>
        ctx.redirect(
          `${errorURL ?? `${ctx.context.baseURL}/error`}?error=${code}`
        )

      if (ctx.query?.error || !ctx.query?.code) {
        return onError(ctx.query?.error ?? 'no_code')
      }
      // Only the link flow is valid here: a credential cannot sign anyone in.
      if (!linkState?.userId) {
        return onError('session_required')
      }

      const provider = ctx.context.socialProviders.find(
        (candidate) => candidate.id === providerId
      )
      if (!provider?.validateAuthorizationCode) {
        return onError('invalid_oauth_config')
      }

      let tokens
      try {
        tokens = await provider.validateAuthorizationCode({
          code: ctx.query.code,
          codeVerifier: config.pkce ? codeVerifier : undefined,
          redirectURI: `${ctx.context.baseURL}${CALLBACK_PATH}/${providerId}`,
        })
      } catch (error) {
        ctx.context.logger.error(
          `Failed to exchange the authorization code for credential '${providerId}'`,
          error
        )
        return onError('oauth_code_verification_failed')
      }

      // Encrypted on write because getAccessToken decrypts on read.
      const tokenData = {
        accessToken: await setTokenUtil(tokens.accessToken, ctx.context),
        refreshToken: await setTokenUtil(tokens.refreshToken, ctx.context),
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
        scope: tokens.scopes?.join(','),
      }

      const existing = (
        await ctx.context.internalAdapter.findAccounts(linkState.userId)
      ).find((account) => account.providerId === providerId)

      // Re-linking updates the row in place: a second row for the same
      // (providerId, userId) would shadow this token, since getAccessToken
      // takes the first match.
      if (existing) {
        await ctx.context.internalAdapter.updateAccount(existing.id, tokenData)
      } else {
        const created = await ctx.context.internalAdapter.createAccount({
          userId: linkState.userId,
          providerId,
          accountId: linkState.userId,
          ...tokenData,
        })
        if (!created) {
          return onError('unable_to_link_account')
        }
      }

      return ctx.redirect(callbackURL ?? ctx.context.baseURL)
    }
  )

  return {
    ...base,
    id: 'credential-oauth',
    // genericOAuth's endpoints are dropped wholesale: its sign-in and link
    // routes are the identity-bound flow this plugin exists to replace.
    endpoints: { linkCredential: link, credentialOAuthCallback: callback },
  }
}
