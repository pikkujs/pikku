import type {
  CoreServices,
  CoreSingletonServices,
  CoreConfig,
  CoreUserSession,
} from '@pikku/core'

export interface UserSession extends CoreUserSession {}

export interface Config extends CoreConfig {}

export interface SingletonServices extends CoreSingletonServices<Config> {}

export interface Services extends CoreServices<SingletonServices> {}
