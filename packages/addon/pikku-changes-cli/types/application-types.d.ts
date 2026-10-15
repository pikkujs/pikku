import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'

export interface Config extends CoreConfig {
  rootDir?: string
}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {}

export interface Services extends CoreServices<SingletonServices> {}

export interface CreateSingletonServices {}

export interface CreateWireServices {}
