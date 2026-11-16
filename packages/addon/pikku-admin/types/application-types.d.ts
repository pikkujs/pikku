import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { BetterAuthInstance } from '@pikku/better-auth'
import type { SecretAdminService } from '../src/services/secret-admin.service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  /**
   * Secret administration over the host's `SecretService`, which the function
   * runner withholds from functions. A thin wrapper, not a store: the host
   * still decides where secrets live.
   */
  secretAdminService: SecretAdminService
  /**
   * The host's resolved better-auth instance, wired by `pikkuBetterAuth`. The
   * user directory works through its internal adapter, so without one every
   * `admin:users:*` function reports auth is not wired.
   */
  auth?: () => Promise<BetterAuthInstance>
}

export interface Services extends CoreServices<SingletonServices> {}
