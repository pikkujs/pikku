import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  EventHubService,
  JWTService,
  QueueService,
} from '@pikku/core'
import { EventHubTopics } from './eventhub-topics.js'
import { TodoStore } from '../src/services/store.service.ts'

export interface Config extends CoreConfig {
  awsRegion: string
}

export interface UserSession extends CoreUserSession {
  userId: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  jwt?: JWTService
  eventHub?: EventHubService<EventHubTopics>
  queueService?: QueueService
  todoStore: TodoStore
}

export interface Services extends CoreServices<SingletonServices> {}
