import type {
  CoreServices,
  CoreSingletonServices,
  CoreConfig,
  CoreUserSession,
} from '@pikku/core'
import type { LogLevel } from '@pikku/core/services'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB, KyselyScopeService } from '@pikku/kysely'

export interface UserSession extends CoreUserSession {
  /**
   * Forwarded from better-auth's admin() plugin (see src/middleware.ts
   * mapSession) so permission checkers can gate on it — the default session map
   * drops it.
   */
  role?: string
}

export interface Config extends CoreConfig {
  port: number
  hostname: string
  logLevel: LogLevel
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: Kysely<KyselyPikkuDB>
  scopeService: KyselyScopeService
}

export interface Services extends CoreServices<SingletonServices> {}
