import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { SystemOneService } from '../src/typesafe.service.js'

export interface Config extends CoreConfig {
  model?: string
}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  systemOne: SystemOneService
}

export interface Services extends CoreServices<SingletonServices> {}
