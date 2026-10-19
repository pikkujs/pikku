import {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  JWTService
} from '@pikku/core'
import { BookService } from './book.service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {
  userId: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  jwt: JWTService
  books: BookService
}

export interface Services extends CoreServices<SingletonServices> {}
