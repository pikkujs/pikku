import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { RegistryService } from '../src/services/registry.service.js'

export interface Config extends CoreConfig {
  port: number
  hostname: string
  apiKey: string
}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  registryService: RegistryService
}

export interface Services extends CoreServices<SingletonServices> {}
