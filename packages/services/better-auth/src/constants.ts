/**
 * The values codegen and tooling read from this package, without loading the
 * better-auth library behind the main entry point.
 */
export { PROVIDER_REGISTRY } from './provider-registry.js'
export type { AuthProvider, AuthProviderDef } from './provider-registry.js'
export { pluginDisplayName } from './plugin-registry.js'
export type { AuthPluginDef } from './plugin-registry.js'
export {
  OAUTH_PROXY_SECRET_ID,
  OAUTH_PROXY_URL_VARIABLE,
  OAUTH_PROXY_KEY_ID_VARIABLE,
  OAUTH_PROXY_PROVIDERS_VARIABLE,
  OAUTH_PROXY_PROVIDER_IDS,
} from './oauth-proxy-constants.js'
export {
  VIRTUAL_USER_SIGN_IN_OPT_IN_ENV,
  DEV_VIRTUAL_USER_SIGN_IN_ENV,
} from './virtual-user-sign-in-gate.js'

/** Brand on the factory `pikkuBetterAuth` returns. A registered symbol, so it matches across copies. */
export const PIKKU_BETTER_AUTH = Symbol.for('pikku.betterAuth')
