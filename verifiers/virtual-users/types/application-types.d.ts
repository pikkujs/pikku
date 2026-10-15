import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'

export interface Config extends CoreConfig {
  /** Read by the virtual-user scaffold when no virtual user environments are configured. */
  nodeEnv?: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
