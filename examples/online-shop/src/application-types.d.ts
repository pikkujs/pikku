import type {
  CoreServices,
  CoreSingletonServices,
  CoreConfig,
  CoreUserSession,
} from '@pikku/core/types'
import type { AuditLog, EmailService } from '@pikku/core/services'
import type { Kysely } from 'kysely'
import type { DB } from '#pikku/db/schema.gen.js'
import type { TypedSecretService } from '../.pikku/secrets/pikku-secrets.gen.js'
import type { TypedVariablesService } from '../.pikku/variables/pikku-variables.gen.js'
import type { auth } from './auth.js'

export interface UserSession extends CoreUserSession {
  userId: string
  /**
   * The shop's own profile role, distinct from the declared system roles in
   * roles.ts. Authorization gates on scopes; this is the column the profile
   * page shows.
   */
  role: 'customer' | 'support' | 'admin'
}

export interface Config extends CoreConfig {
  port: number
  hostname: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  variables: TypedVariablesService
  secrets: TypedSecretService
  kysely: Kysely<DB>
  // Lazy Better Auth factory, injected by the generated pikkuServices wrapper.
  // MUST be the factory shape `() => Promise<AuthInstance>` to satisfy
  // CoreSingletonServices['auth'] — call it (`await services.auth()`) to get
  // better-auth's full server `api`/`handler` surface; it memoises on first call.
  auth: () => Promise<Awaited<ReturnType<typeof auth>>>
  // Always constructed in services.ts, so declare it REQUIRED here — it is
  // optional in CoreSingletonServices, which otherwise makes every emailService
  // use read as possibly-undefined and forces needless `!`/guards in functions.
  emailService: EmailService
  // Per-invocation audit log, ALWAYS returned from createWireServices (see
  // services.ts) so general activity logging is available in every function —
  // `await auditLog.write({ type, source: 'explicit', metadata })`. Declared
  // REQUIRED (like emailService above) so a plain `auditLog.write(...)` doesn't
  // read as possibly-undefined and force needless `?.`/guards. A function with
  // `audit: true` ADDITIONALLY gets a kysely wrapped to capture every table write.
  auditLog: AuditLog
}

export interface Services extends CoreServices<SingletonServices> {}
