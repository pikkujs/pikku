import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'

export interface Config extends CoreConfig {}

export interface Ledger {
  record(event: string): void
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  ledger?: Ledger
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
