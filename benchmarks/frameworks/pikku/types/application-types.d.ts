import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { BenchDB } from '../../shared/db.js'

export interface Config extends CoreConfig {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: BenchDB
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {
  permissions: string
}
