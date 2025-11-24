/**
 * Service Hydration Utility
 *
 * Helper for packages to reuse parent services while creating their own.
 * Prevents resource duplication (DB connections, etc.) while maintaining isolation.
 */

import type {
  ServiceHydrationOptions,
  PackageSingletonServices,
} from './package-loader.types.js'
import type { CoreSingletonServices } from '../types/core.types.js'

/**
 * Hydrate package services from parent services
 *
 * @param parentServices - Services from the parent application
 * @param packageServices - Services created by the package
 * @param options - Hydration strategy options
 * @returns Combined services with proper hydration
 *
 * @example
 * ```typescript
 * export const createSingletonServices = async (config, parentServices) => {
 *   const packageServices = {
 *     stripe: new Stripe(config.stripeApiKey),
 *   }
 *
 *   return hydrateServices(parentServices, packageServices, {
 *     alwaysHydrate: ['logger', 'variables', 'schema', 'config'],
 *     conditionalHydrate: ['db', 'redis'],
 *     neverHydrate: ['stripe']
 *   })
 * }
 * ```
 */
export function hydrateServices<T extends PackageSingletonServices>(
  parentServices: CoreSingletonServices,
  packageServices: Partial<T>,
  options: ServiceHydrationOptions
): T {
  const hydrated: any = {}

  // Always hydrate: copy from parent (never duplicate)
  for (const key of options.alwaysHydrate) {
    if (key in parentServices) {
      hydrated[key] = parentServices[key as keyof CoreSingletonServices]
    }
  }

  // Conditionally hydrate: use parent if available, else package's own
  for (const key of options.conditionalHydrate) {
    if (
      key in parentServices &&
      parentServices[key as keyof CoreSingletonServices]
    ) {
      hydrated[key] = parentServices[key as keyof CoreSingletonServices]
    } else if (key in packageServices) {
      hydrated[key] = packageServices[key as keyof T]
    }
  }

  // Never hydrate: always use package's own
  for (const key of options.neverHydrate) {
    if (key in packageServices) {
      hydrated[key] = packageServices[key as keyof T]
    }
  }

  return hydrated as T
}

/**
 * Standard hydration strategy for most packages
 *
 * - Always reuse: logger, variables, schema, config
 * - Conditionally reuse: db, redis, kv
 * - Never reuse: (specify package-specific services)
 */
export const createStandardHydrationOptions = (
  packageSpecificServices: string[]
): ServiceHydrationOptions => ({
  alwaysHydrate: ['logger', 'variables', 'schema', 'config'],
  conditionalHydrate: ['db', 'redis', 'kv'],
  neverHydrate: packageSpecificServices,
})

/**
 * Minimal hydration strategy for lightweight packages
 *
 * Only reuses logger and config, creates everything else independently
 */
export const createMinimalHydrationOptions = (
  packageSpecificServices: string[]
): ServiceHydrationOptions => ({
  alwaysHydrate: ['logger', 'config'],
  conditionalHydrate: [],
  neverHydrate: [
    ...packageSpecificServices,
    'variables',
    'schema',
    'db',
    'redis',
    'kv',
  ],
})

/**
 * Maximum hydration strategy for packages that want to reuse everything possible
 *
 * Reuses all available parent services, only creates package-specific ones
 */
export const createMaximalHydrationOptions = (
  packageSpecificServices: string[]
): ServiceHydrationOptions => ({
  alwaysHydrate: ['logger', 'variables', 'schema', 'config'],
  conditionalHydrate: ['db', 'redis', 'kv', 's3', 'email', 'queue', 'cache'],
  neverHydrate: packageSpecificServices,
})
