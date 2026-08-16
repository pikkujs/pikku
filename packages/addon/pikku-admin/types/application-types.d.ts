import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { BetterAuthInstance } from '@pikku/better-auth'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  /**
   * The host's resolved better-auth instance, wired by `pikkuBetterAuth`. The
   * user directory reads its adapter and brokers its `admin()` endpoints, so
   * without one every `admin:users:*` function reports auth is not wired.
   */
  auth?: () => Promise<BetterAuthInstance>
}

export interface Services extends CoreServices<SingletonServices> {}
