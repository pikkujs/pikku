export { createAuthHandler } from './auth-handler.js'
export {
  CROSS_SITE_COOKIE_HEADER,
  CROSS_SITE_SET_COOKIE_HEADER,
  decodeSetCookies,
} from './cross-site-cookies.js'
export { createResolvedAuthGetter, getAuthSession } from './auth-api.js'
export { betterAuthSession } from './auth-session.js'
export { withResolvedScopes } from './auth-session-scopes.js'
export {
  ADMIN_SCOPES,
  ADMIN_SCOPE_ROOT,
  ADMIN_SCOPE_TREE,
  OPERATOR_SCOPE_ROOTS,
  resolvedUserHoldsScopes,
} from './auth-scopes.js'
export {
  createAuthUser,
  deleteAuthUser,
  revokeAuthUserSessions,
  setAuthUserBanned,
  setAuthUserPassword,
} from './admin-users.js'
export type { AuthGetter } from './admin-users.js'
export { pikkuBan, BAN_PLUGIN_ID } from './ban-plugin.js'
export type { BanPluginOptions } from './ban-plugin.js'
export { pikkuActor } from './actor-plugin.js'
export type { ActorPluginOptions } from './actor-plugin.js'
export {
  ACTOR_NOT_PROVISIONED_MESSAGE,
  ACTOR_SIGN_IN_DISABLED_MESSAGE,
  ACTOR_SIGN_IN_OPT_IN_ENV,
  ACTOR_SIGN_IN_OPT_IN_VALUE,
  DEV_ACTOR_SIGN_IN_ENV,
  resolveActorSignIn,
} from './actor-sign-in-gate.js'
export type {
  ActorSignInGate,
  ActorSignInReason,
} from './actor-sign-in-gate.js'

export { provisionPersonas } from './provision-personas.js'
export type {
  PersonaOrphanPolicy,
  ProvisionPersonasOptions,
  ProvisionPersonasResult,
  ProvisionPersonasServices,
} from './provision-personas.js'
export { pikkuFabric } from './fabric-plugin.js'
export type { FabricPluginOptions } from './fabric-plugin.js'
export {
  pikkuDelegatedAuth,
  DELEGATED_PROVIDER_ID,
} from './delegated-auth-plugin.js'
export type {
  DelegatedAuthOptions,
  UpstreamIdentity,
} from './delegated-auth-plugin.js'
export { betterAuthStatelessSession } from './auth-session-stateless.js'
export type { BetterAuthStatelessSessionOptions } from './auth-session-stateless.js'
export { betterAuthStoreSession } from './auth-session-store.js'
export type {
  BetterAuthStoreSessionOptions,
  SessionTransport,
} from './auth-session-store.js'
export { inMemorySessionStore, prefixedSessionStore } from './session-store.js'
export type { SessionStore, InMemorySessionStore } from './session-store.js'
export { verifySessionCredential } from './session-credential.js'
export { pikkuBetterAuth, PIKKU_BETTER_AUTH } from './define-auth.js'
export type {
  PikkuBetterAuthFactory,
  BetterAuthInstance,
} from './define-auth.js'
export { BetterAuthCredentialService } from './better-auth-credential.service.js'
export { credentialOAuthProviders } from './credential-oauth-providers.js'
export type {
  CredentialOAuth2Configs,
  CredentialOAuthProvider,
  CredentialOAuthSecretReader,
} from './credential-oauth-providers.js'
export {
  pikkuCredentialOAuth,
  PLATFORM_USER_ID,
} from './credential-oauth.plugin.js'
export type { CredentialOAuthOptions } from './credential-oauth.plugin.js'
export { PROVIDER_REGISTRY } from './provider-registry.js'
export type { AuthProvider, AuthProviderDef } from './provider-registry.js'
export { pluginDisplayName } from './plugin-registry.js'
export type { AuthPluginDef } from './plugin-registry.js'
