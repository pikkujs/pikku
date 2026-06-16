import type {
  CoreServices,
  CoreSingletonServices,
  CoreConfig,
  CoreUserSession,
} from '@pikku/core'
import type { LogLevel } from '@pikku/core/services'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'

export interface UserSession extends CoreUserSession {}

export interface Config extends CoreConfig {
  port: number
  hostname: string
  logLevel: LogLevel
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: Kysely<KyselyPikkuDB>
}

export interface Services extends CoreServices<SingletonServices> {}
