import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  EventHubService,
  JWTService,
  QueueService,
  SecretService,
} from '@pikku/core'
import { EventHubTopics } from './eventhub-topics.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {
  userId: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  jwt?: JWTService
  eventHub?: EventHubService<EventHubTopics>
  secrets?: SecretService
  queueService?: QueueService
}

export interface Services extends CoreServices<SingletonServices> {}
