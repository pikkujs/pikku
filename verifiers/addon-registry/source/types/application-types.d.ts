import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { FeatureFlagSource } from '@pikku/core/services'
import type { NoopService } from '../src/services/noop-service.js'

/**
 * A field of the addon's own, required, and a core service narrowed to what
 * the addon expects. Neither fits the core types, so the generated
 * pikku-package.gen.ts only type-checks because core's factory slot does not
 * hold an addon's factory to them (the cast an addon used to need hid the
 * factory from the inspector: PKU564).
 */
export interface Config extends CoreConfig {
  registryRegion: string
}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  noop: NoopService
  featureFlags?: FeatureFlagSource & { readonly addonScoped: true }
}

export interface Services extends CoreServices<SingletonServices> {}

export interface CreateSingletonServices {
  noop: NoopService
}

export interface CreateWireServices {}
