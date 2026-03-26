import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { OAuthApiClient } from '../src/oauth-api-client.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {}

export interface Services extends CoreServices<SingletonServices> {
  oauthApiClient: OAuthApiClient
}
