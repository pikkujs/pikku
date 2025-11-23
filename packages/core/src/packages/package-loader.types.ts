/**
 * Package Loader Types
 *
 * Defines the structure and lifecycle of external Pikku packages
 */

import type { CoreSingletonServices } from '../types/core.types.js'
import type { CorePikkuFunctionConfig } from '../function/functions.types.js'
import type { FunctionsMeta } from '../types/core.types.js'

/**
 * Package-specific configuration
 * Packages can define their own config structure
 */
export type PackageConfig = Record<string, any>

/**
 * Factory function to create package configuration
 * Receives parent config and can extract or transform values
 */
export type CreatePackageConfig<T extends PackageConfig = PackageConfig> = (
  parentConfig: Record<string, any>
) => T

/**
 * Package-specific singleton services
 * These are created once per package and reused across requests
 */
export type PackageSingletonServices = Record<string, any>

/**
 * Factory function to create package singleton services
 * Receives package config and parent services for hydration
 */
export type CreatePackageSingletonServices<
  TConfig extends PackageConfig = PackageConfig,
  TServices extends PackageSingletonServices = PackageSingletonServices,
> = (
  config: TConfig,
  parentServices: CoreSingletonServices
) => Promise<TServices> | TServices

/**
 * Package-specific wire services (per-request)
 * These are created for each request/function invocation
 */
export type PackageWireServices = Record<string, any>

/**
 * Factory function to create package wire services
 * Receives singleton services
 */
export type CreatePackageWireServices<
  TSingletons extends PackageSingletonServices = PackageSingletonServices,
  TWireServices extends PackageWireServices = PackageWireServices,
> = (singletons: TSingletons) => Promise<TWireServices> | TWireServices

/**
 * Package metadata (pre-built and published with package)
 * Contains function definitions, types, and other metadata
 */
export interface PackageMetadata {
  /** Package name (e.g., '@acme/stripe-functions') */
  name: string

  /** Package version */
  version: string

  /** Function metadata */
  functions: FunctionsMeta

  /** Additional metadata can be added here */
  [key: string]: any
}

/**
 * Package registration
 * Contains all factory functions and metadata for a package
 */
export interface PackageRegistration<
  TConfig extends PackageConfig = PackageConfig,
  TSingletons extends PackageSingletonServices = PackageSingletonServices,
  TWireServices extends PackageWireServices = PackageWireServices,
> {
  /** Full package name (e.g., '@acme/stripe-functions') */
  name: string

  /** Package metadata (pre-built) */
  metadata: PackageMetadata

  /** Factory to create package config */
  createConfig: CreatePackageConfig<TConfig>

  /** Factory to create singleton services */
  createSingletonServices: CreatePackageSingletonServices<TConfig, TSingletons>

  /** Factory to create wire services */
  createWireServices: CreatePackageWireServices<TSingletons, TWireServices>
}

/**
 * Loaded package instance
 * Represents a package that has been loaded (config created) but may not be initialized
 */
export interface LoadedPackage<
  TConfig extends PackageConfig = PackageConfig,
  TSingletons extends PackageSingletonServices = PackageSingletonServices,
  TWireServices extends PackageWireServices = PackageWireServices,
> {
  /** Full package name */
  name: string

  /** Package configuration */
  config: TConfig

  /** Singleton services (null until lazy-initialized) */
  singletons: TSingletons | null

  /** Wire services (null until lazy-initialized) */
  wires: TWireServices | null

  /** Package functions */
  functions: Map<string, CorePikkuFunctionConfig<any, any>>

  /** Package registration (for accessing factory functions) */
  registration: PackageRegistration<TConfig, TSingletons, TWireServices>
}

/**
 * Service hydration options
 * Defines which services should be reused from parent, created new, or conditionally used
 */
export interface ServiceHydrationOptions {
  /** Always reuse these services from parent (e.g., ['logger', 'variables', 'schema', 'config']) */
  alwaysHydrate: string[]

  /** Reuse from parent if available, else create own (e.g., ['db', 'redis']) */
  conditionalHydrate: string[]

  /** Always create own instance (e.g., ['stripe', 'twilio']) */
  neverHydrate: string[]
}
