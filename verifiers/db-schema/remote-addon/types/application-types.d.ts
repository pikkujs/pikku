import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { Kysely } from 'kysely'

/**
 * The table this addon ships, on the database of whichever host runs it.
 *
 * It is declared and exported exactly like a local addon's table: the addon
 * cannot know how it will be consumed, so `pikku db export` publishes this
 * schema either way. What decides whether the table is the consumer's business
 * is the consumer's own wiring — `wireRemoteAddon` means these handlers run
 * somewhere else, against a database this project must not migrate.
 */
export interface NotesDB {
  notes: {
    id: string
    body: string
  }
}

export interface Config extends CoreConfig {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: Kysely<NotesDB>
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
