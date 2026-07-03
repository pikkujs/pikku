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
  greetingStore: { greet(name: string): string }
  auditSink: { record(event: string): void }
}

export interface Services extends CoreServices<SingletonServices> {}

export interface CreateSingletonServices {
  noop: NoopService
}

export interface CreateWireServices {}
