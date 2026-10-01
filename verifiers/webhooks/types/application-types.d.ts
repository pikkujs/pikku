import type { CredentialService } from '@pikku/core/services'
import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'

export interface Config extends CoreConfig {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  credentialService: CredentialService
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
