export { createAuthHandler } from './auth-handler.js'
export {
  DEV_QUICK_LOGIN_USER,
  DEV_QUICK_LOGIN_SUBPATH,
  devQuickLoginEnabled,
} from './dev-quick-login.js'
export { createResolvedAuthGetter, getAuthSession } from './auth-api.js'
export { betterAuthSession } from './auth-session.js'
export { withResolvedScopes } from './auth-session-scopes.js'
export { actor } from './actor-plugin.js'
export type { ActorPluginOptions } from './actor-plugin.js'
export { fabric } from './fabric-plugin.js'
export type { FabricPluginOptions } from './fabric-plugin.js'
export {
  delegatedAuth,
  DELEGATED_PROVIDER_ID,
} from './delegated-auth-plugin.js'
export type {
  DelegatedAuthOptions,
  DelegatedCredentials,
  UpstreamIdentity,
} from './delegated-auth-plugin.js'
export { stampActorFlag } from './stamp-actor-flag.js'
export { betterAuthStatelessSession } from './auth-session-stateless.js'
export type { BetterAuthStatelessSessionOptions } from './auth-session-stateless.js'
export { pikkuBetterAuth, PIKKU_BETTER_AUTH } from './define-auth.js'
export type {
  PikkuBetterAuthFactory,
  BetterAuthInstance,
} from './define-auth.js'
export { BetterAuthCredentialService } from './better-auth-credential.service.js'
export type { BetterAuthCredentialServiceOptions } from './better-auth-credential.service.js'
export { credentialOAuthProviders } from './credential-oauth-providers.js'
export type {
  CredentialOAuth2Configs,
  CredentialOAuthApp,
  CredentialOAuthProvider,
  CredentialOAuthSecretReader,
} from './credential-oauth-providers.js'
export { credentialOAuth, PLATFORM_USER_ID } from './credential-oauth.plugin.js'
export type { CredentialOAuthOptions } from './credential-oauth.plugin.js'
export { PROVIDER_REGISTRY } from './provider-registry.js'
export type {
  AuthProvider,
  AuthProviderDef,
  AuthProviderVariable,
} from './provider-registry.js'
export { PLUGIN_REGISTRY, pluginDisplayName } from './plugin-registry.js'
export type { AuthPluginDef } from './plugin-registry.js'
