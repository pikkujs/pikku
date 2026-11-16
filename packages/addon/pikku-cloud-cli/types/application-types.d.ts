import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { KeyCrypto } from '@pikku/core/keys'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  keyCrypto: KeyCrypto
}

export interface Services extends CoreServices<SingletonServices> {}

export interface CreateSingletonServices {}

export interface CreateWireServices {}
