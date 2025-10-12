import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { MiddlewareCheckerService } from '../services/middleware-checker.service.js'

export type Config = CoreConfig

export interface SingletonServices extends CoreSingletonServices<Config> {
  middlewareChecker: MiddlewareCheckerService
}

export interface Services
  extends CoreServices<SingletonServices, UserSession> {}

export interface UserSession extends CoreUserSession {}
