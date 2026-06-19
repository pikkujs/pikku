import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { auth } from '../src/auth.ts'

export interface Config extends CoreConfig {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  kysely: Kysely<KyselyPikkuDB>
  auth: () => Promise<Awaited<ReturnType<typeof auth>>>
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
