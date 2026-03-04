import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { TodoStore } from '../src/services/store.service.ts'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {
  userId: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  todoStore: TodoStore
}

export interface Services extends CoreServices<SingletonServices> {}
