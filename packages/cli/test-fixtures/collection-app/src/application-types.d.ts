import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { Kysely } from 'kysely'
import type { DB } from '#pikku/db/schema.gen.js'

export interface Config extends CoreConfig {
  sqliteDb?: string
}
export interface UserSession extends CoreUserSession {
  userId: string
}
export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: Kysely<DB>
}
export interface Services extends CoreServices<SingletonServices> {}
