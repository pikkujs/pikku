import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { Kysely } from 'kysely'
import type { Logger } from '@pikku/core/services'
import type { DB } from './db.types.js'
import type { EmailService } from './email-service.js'
import type { ClockService } from './clock-service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: Kysely<DB>
  email: EmailService
  clock: ClockService
  // A service whose type comes from an external package — carved by re-import.
  auditLogger: Logger
}

export interface Services extends CoreServices<SingletonServices> {}
