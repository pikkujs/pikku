import type { EventHubService } from '@pikku/core/channel'
import type { QueueService } from '@pikku/core/queue'
import type { JWTService, SecretService } from '@pikku/core/services'
import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'

export interface Config extends CoreConfig {
  /** The postgres the db-backed runners share; `pikku db` reads it from here. */
  postgresUrl: string
}

export interface UserSession extends CoreUserSession {
  userId: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  jwt?: JWTService
  eventHub?: EventHubService<Record<string, any>>
  queueService?: QueueService
}

export interface Services extends CoreServices<SingletonServices> {}
