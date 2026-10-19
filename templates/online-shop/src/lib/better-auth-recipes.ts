import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { bearer } from 'better-auth/plugins/bearer'
import type { CoreSingletonServices } from '@pikku/core/types'
import type { CredentialService } from '@pikku/core/services'
import {
  ADMIN_SCOPES,
  BetterAuthCredentialService,
  CROSS_SITE_COOKIE_HEADER,
  CROSS_SITE_SET_COOKIE_HEADER,
  betterAuthSession,
  betterAuthStatelessSession,
  betterAuthStoreSession,
  createAuthHandler,
  createAuthUser,
  createResolvedAuthGetter,
  credentialOAuthProviders,
  decodeSetCookies,
  deleteAuthUser,
  getAuthSession,
  inMemorySessionStore,
  pikkuCredentialOAuth,
  pikkuDelegatedAuth,
  prefixedSessionStore,
  resolvedUserHoldsScopes,
  revokeAuthUserSessions,
  sendAuthUserSignInLink,
  setAuthUserBanned,
  setAuthUserPassword,
  type AuthGetter,
  type CredentialOAuth2Configs,
  type PikkuBetterAuthFactory,
} from '@pikku/better-auth'

/*
 * Usage of `@pikku/better-auth` beyond the shop's own `auth.ts`, kept here as
 * the snippet source its TSDoc points at. Each recipe is a function so nothing
 * runs when the module is loaded.
 */

export const sessionMiddlewareRecipe = () =>
  // @snippet start betterAuthSessionMiddleware
  betterAuthSession({
    // Enrich the session from your own data; the default is { userId, orgId? }.
    mapSession: async ({ user, session }) => ({
      userId: user.id,
      orgId: session.activeOrganizationId ?? undefined,
    }),
    // Machine callers: an `x-api-key` header is authoritative for its request.
    apiKey: {
      mapKey: async (key) => ({ userId: key.userId, scopes: ['orders:read'] }),
    },
    // Honour x-pikku-impersonate-user-id for callers holding admin:impersonate.
    impersonation: {},
  })
// @snippet end betterAuthSessionMiddleware

export const statelessSessionRecipe = () =>
  // @snippet start betterAuthStatelessSession
  betterAuthStatelessSession({
    // Only when the auth config sets advanced.cookiePrefix / cookieCache.version.
    cookiePrefix: 'online-shop',
    cookieCache: { version: '2' },
  })
// @snippet end betterAuthStatelessSession

export const storeSessionRecipe = () => {
  // @snippet start betterAuthStoreSession
  // One storage for better-auth's secondaryStorage and for the middleware.
  const storage = prefixedSessionStore(inMemorySessionStore(), 'online-shop/')

  const auth = betterAuth({
    database: memoryAdapter({}),
    secondaryStorage: storage,
    // Echoes the token on `set-auth-token` for `Authorization: Bearer …`.
    plugins: [bearer()],
  })

  const middleware = betterAuthStoreSession({
    store: () => storage,
    transports: ['header', 'cookie'],
  })
  // @snippet end betterAuthStoreSession
  return { auth, middleware }
}

export const serverSessionRecipe = async <S extends CoreSingletonServices>(
  auth: PikkuBetterAuthFactory<any, S>,
  createSingletonServices: (config: any) => Promise<S>,
  request: Request
) => {
  // @snippet start betterAuthServerSession
  // In a Next.js route or a TanStack loader: the factory, its services and the
  // instance are built on the first call and reused after it.
  const session = await getAuthSession(
    auth,
    request,
    undefined,
    createSingletonServices
  )

  // Or hold the instance getter yourself.
  const getAuth = createResolvedAuthGetter(
    auth,
    undefined,
    createSingletonServices
  )
  const instance = await getAuth()
  // @snippet end betterAuthServerSession
  return { session, instance }
}

// @snippet start betterAuthHandler
// What the CLI generates for `/api/auth/**`: it reads `services.auth`.
export const authHandlerRecipe = createAuthHandler()
// @snippet end betterAuthHandler

export const userAdminRecipe = async (services: CoreSingletonServices) => {
  // @snippet start betterAuthUserAdmin
  // Call these from functions gated on the matching admin:users:* scope.
  const auth: AuthGetter = services.auth
  const userId = await createAuthUser(auth, { email: 'ada@example.com' })
  await sendAuthUserSignInLink(auth, {
    email: 'ada@example.com',
    callbackURL: '/welcome',
  })
  await setAuthUserPassword(auth, { userId, newPassword: 'a-long-password' })
  await setAuthUserBanned(auth, {
    userId,
    banned: true,
    reason: 'Chargebacks',
    expiresInSeconds: 7 * 24 * 60 * 60,
  })
  await revokeAuthUserSessions(auth, userId)
  await deleteAuthUser(auth, userId)
  // @snippet end betterAuthUserAdmin
}

export const scopeGateRecipe = async (services: CoreSingletonServices) => {
  // @snippet start betterAuthScopeGate
  // The check the package's own gates make, before any pikku session exists.
  const mayImpersonate = await resolvedUserHoldsScopes(
    'user-1',
    [ADMIN_SCOPES.impersonate],
    services.scopeService,
    services.logger
  )
  // @snippet end betterAuthScopeGate
  return mayImpersonate
}

export const credentialOAuthRecipe = async (
  services: CoreSingletonServices,
  configs: CredentialOAuth2Configs,
  fallback: CredentialService
) => {
  // @snippet start betterAuthCredentialOAuth
  // In the auth factory: one provider per `defineCredential({ oauth2 })`,
  // from the generated CREDENTIAL_OAUTH2_CONFIGS.
  const plugin = pikkuCredentialOAuth({
    config: await credentialOAuthProviders(
      configs,
      services.secrets,
      services.logger
    ),
    scopeService: services.scopeService,
    logger: services.logger,
  })

  // In services.ts: tokens are read (and refreshed) from better-auth's
  // account table; every other credential goes to `fallback`.
  const credentialService = new BetterAuthCredentialService({
    getAuth: async () => services.auth!(),
    oauth2Names: Object.keys(configs),
    singletonOAuth2Names: Object.entries(configs)
      .filter(([, config]) => config.type === 'singleton')
      .map(([name]) => name),
    fallback,
  })
  // @snippet end betterAuthCredentialOAuth
  return { plugin, credentialService }
}

export const delegatedAuthRecipe = (
  services: CoreSingletonServices,
  upstream: {
    login: (
      login: string,
      password: string
    ) => Promise<{
      id: string
      email?: string
      role?: string
      token: string
    } | null>
  }
) =>
  // @snippet start betterAuthDelegated
  pikkuDelegatedAuth({
    authenticate: async ({ login, password }) => {
      const account =
        login && password ? await upstream.login(login, password) : null
      if (!account) return null
      return {
        externalId: account.id,
        email: account.email ?? `${account.id}@upstream.invalid`,
        syntheticEmail: !account.email,
        role: account.role,
        credential: { token: account.token },
      }
    },
    storeCredential: async (userId, identity) => {
      await services.credentialService?.set(
        'upstream',
        identity.credential,
        userId
      )
    },
    defaultRole: 'member',
    // Off by default: an upstream's email is its word, not proof of ownership.
    linkExistingUsersByEmail: 'non-admins',
    scopeService: services.scopeService,
    logger: services.logger,
  })
// @snippet end betterAuthDelegated

// @snippet start betterAuthCrossSiteRelay
// The browser half of AUTH_COOKIE_CROSS_SITE, for an app inside a
// third-party iframe: keep what the server echoes, send it back on each call.
export const relayFetch = async (input: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers)
  const kept = localStorage.getItem('pikku-cookies')
  if (kept) headers.set(CROSS_SITE_COOKIE_HEADER, kept)

  const response = await fetch(input, { ...init, headers })
  const echoed = response.headers.get(CROSS_SITE_SET_COOKIE_HEADER)
  if (echoed) {
    const pairs = decodeSetCookies(echoed).map((c) => c.split(';')[0]!)
    localStorage.setItem('pikku-cookies', pairs.join('; '))
  }
  return response
}
// @snippet end betterAuthCrossSiteRelay
