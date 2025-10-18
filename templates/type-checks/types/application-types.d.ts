import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  EventHubService,
  JWTService,
  SecretService,
} from '@pikku/core'

export type Config = CoreConfig

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {}

export interface Services
  extends CoreServices<SingletonServices, UserSession> {}
