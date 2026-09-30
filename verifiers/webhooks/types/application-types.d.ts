import type { WebhookSigningSecret } from '@pikku/core/hmac'
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
  /** The shop's signing secret, read from the credential store per delivery. */
  shopSigningSecret: WebhookSigningSecret
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
