import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'

export type Config = CoreConfig

export interface UserSession extends CoreUserSession<{}> {
}

export type SingletonServices = CoreSingletonServices<Config, UserSession>

export interface Services extends CoreServices<SingletonServices> {
}
