export { createAuthRoutes } from './auth-routes.js'
export { createAuthHandler } from './auth-handler.js'
export type { AuthConfigOrFactory } from './auth-handler.js'
export { authJsSession } from './auth-session.js'
export { wireAuth } from './wire-auth.js'
export type {
  WireAuthOptions,
  WireAuthCallbacks,
  AuthProvider,
} from './wire-auth.js'
export { PROVIDER_REGISTRY } from './provider-registry.js'
export type { AuthProviderDef } from './provider-registry.js'
