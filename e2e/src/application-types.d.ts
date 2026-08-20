import type {
  CoreServices,
  CoreSingletonServices,
  CoreConfig,
  CoreUserSession,
} from '@pikku/core/types'
import type { LogLevel } from '@pikku/core/services'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB, KyselyScopeService } from '@pikku/kysely'

export interface UserSession extends CoreUserSession {}

export interface Config extends CoreConfig {
  port: number
  hostname: string
  logLevel: LogLevel
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: Kysely<KyselyPikkuDB>
  /**
   * The scope service's own Kysely — same database as `kysely`, but with the
   * CamelCase/Serialize plugins its query builders expect. Exposed because the
   * scope tables are written after Better Auth has created `user`, which
   * happens in `afterStart`, long after this factory has returned.
   */
  scopeDb: Kysely<KyselyPikkuDB>
  scopeService: KyselyScopeService
}

export interface Services extends CoreServices<SingletonServices> {}
