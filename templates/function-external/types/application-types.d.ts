import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { NoopService } from '../src/services/noop-service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  noop: NoopService
}

export interface Services extends CoreServices<SingletonServices> {}

export interface CreateSingletonServices {
  noop: NoopService
}

export interface CreateWireServices {}
