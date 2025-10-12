import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { CustomLogger } from '../services/custom-logger.service.js'

export type Config = CoreConfig

export interface SingletonServices extends CoreSingletonServices<Config> {
  logger: CustomLogger
}

export interface Services
  extends CoreServices<SingletonServices, UserSession> {}

export interface UserSession extends CoreUserSession {}
