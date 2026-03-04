import type {
  CoreServices,
  CoreSingletonServices,
  CoreConfig,
  CoreUserSession,
} from '@pikku/core'
import type { LogLevel } from '@pikku/core/services'

export interface UserSession extends CoreUserSession {}

export interface Config extends CoreConfig {
  port: number
  hostname: string
  logLevel: LogLevel
}

export interface SingletonServices extends CoreSingletonServices<Config> {}

export interface Services extends CoreServices<SingletonServices> {}
