import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  /** Taken from the project that wires the addon: the addon's factory does not build it. */
  stamper: { stamp(text: string): string }
}

export interface Services extends CoreServices<SingletonServices> {}
