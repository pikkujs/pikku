import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { Kysely } from 'kysely'

/**
 * The table this addon ships, declared in `db/sqlite/0001-labels.sql` and
 * published to consumers by `pikku db export`.
 *
 * The addon types its own table and never sees the consumer's. At runtime both
 * are the same Kysely instance against the same database; each package type-checks
 * against the tables it owns, which is what keeps the boundary honest.
 */
export interface LabelsDB {
  labels: {
    id: string
    name: string
    color: string | null
  }
}

export interface Config extends CoreConfig {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: Kysely<LabelsDB>
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
