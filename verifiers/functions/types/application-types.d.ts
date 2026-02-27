import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  EventHubService,
  JWTService,
  QueueService,
} from '@pikku/core'
import type { EventHubTopics } from './eventhub-topics.js'
import type { CustomLogger } from '../src/services/custom-logger.service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {
  userId: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  logger: CustomLogger
  jwt?: JWTService
  eventHub?: EventHubService<EventHubTopics>
  queueService?: QueueService
}

export interface Services extends CoreServices<SingletonServices> {}
