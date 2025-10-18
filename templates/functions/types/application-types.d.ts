import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  EventHubService,
  JWTService,
  SecretService,
} from '@pikku/core'
import { EventHubTopics } from './eventhub-topics.js'

export type Config = CoreConfig

export interface UserSession extends CoreUserSession {
  userId: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  jwt?: JWTService
  eventHub?: EventHubService<EventHubTopics>
  secrets?: SecretService
}

export interface Services
  extends CoreServices<SingletonServices, UserSession> {}
