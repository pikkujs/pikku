import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { HttpRequesterService } from '../src/http-requester.service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  httpRequester: HttpRequesterService
}

export interface Services extends CoreServices<SingletonServices> {}
