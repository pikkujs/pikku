import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { Kysely } from 'kysely'
import type { AltchaService } from '../src/services/altcha.service.js'

/**
 * The table this addon ships, declared in `db/tables.ts` and published to
 * consumers by `pikku all`. The addon types only the table it owns; at runtime
 * it is the consumer's Kysely instance against the consumer's database.
 */
export interface CaptchaDB {
  captcha_used_challenge: {
    id: string
    expiry: Date
  }
}

export interface Config extends CoreConfig {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: Kysely<CaptchaDB>
  /** Issues and checks challenges; holds the HMAC secrets functions cannot read. */
  altcha: AltchaService
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
