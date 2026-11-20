import type { QueueService } from '@pikku/core/queue'
import type { JWTService } from '@pikku/core/services'
import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { CustomLogger } from '../src/services/custom-logger.service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {
  userId: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  greetingStore: { greet(name: string): string }
  auditSink: { record(event: string): void }
  logger: CustomLogger
  jwt?: JWTService
  queueService?: QueueService
}

export interface Services extends CoreServices<SingletonServices> {
  requestStamp: { id: string }
}
