import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { LabelsDB } from '@pikku/verifier-db-addon/types'

export interface Config extends CoreConfig {
  sqliteDb?: string
  postgresUrl?: string
}

/**
 * One Kysely over both the runtime's tables and the addon's.
 *
 * The addon declares `labels` for itself and never sees `KyselyPikkuDB`; the
 * consumer intersects the two because it is the one that owns the database and
 * migrated both.
 */
export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: Kysely<KyselyPikkuDB & LabelsDB>
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
