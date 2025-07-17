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

export interface UserSession extends CoreUserSession {
  userId: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  jwt?: JWTService
  eventHub?: EventHubService<unknown>
  secrets?: SecretService
}

export interface Services
  extends CoreServices<SingletonServices, UserSession> {}
