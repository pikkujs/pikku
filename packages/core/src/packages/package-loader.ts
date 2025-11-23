/**
 * Package Loader
 *
 * Central registry for external Pikku packages.
 * Handles package registration, lazy initialization, and function access.
 */

import { pikkuState, initializePackageState } from '../pikku-state.js'
import type { CorePikkuFunctionConfig } from '../function/functions.types.js'
import type { CoreSingletonServices } from '../types/core.types.js'
import type {
  PackageRegistration,
  LoadedPackage,
  PackageConfig,
  PackageSingletonServices,
  PackageWireServices,
} from './package-loader.types.js'

export class PackageLoader {
  private packages = new Map<string, PackageRegistration<any, any, any>>()
  private loaded = new Map<string, LoadedPackage<any, any, any>>()

  /**
   * Register a package with its factory functions and metadata
   *
   * Called automatically when a package's bootstrap file is imported
   *
   * @param registration - Package registration info
   */
  register<
    TConfig extends PackageConfig = PackageConfig,
    TSingletons extends PackageSingletonServices = PackageSingletonServices,
    TWireServices extends PackageWireServices = PackageWireServices,
  >(
    registration: PackageRegistration<TConfig, TSingletons, TWireServices>
  ): void {
    if (this.packages.has(registration.name)) {
      throw new Error(`Package already registered: ${registration.name}`)
    }

    this.packages.set(registration.name, registration)

    // Initialize package state
    initializePackageState(registration.name)
  }

  /**
   * Load a package (create config, but don't initialize services yet)
   *
   * @param packageName - Full package name
   * @param parentConfig - Parent application config
   * @returns Loaded package instance
   */
  loadPackage(
    packageName: string,
    parentConfig: Record<string, any>
  ): LoadedPackage {
    // Return cached if already loaded
    if (this.loaded.has(packageName)) {
      return this.loaded.get(packageName)!
    }

    const registration = this.packages.get(packageName)
    if (!registration) {
      throw new Error(
        `Package not registered: ${packageName}. ` +
          `Make sure the package's bootstrap file has been imported.`
      )
    }

    // Create package config
    const config = registration.createConfig(parentConfig)

    // Create loaded package (services are null - lazy initialization)
    const pkg: LoadedPackage = {
      name: packageName,
      config,
      singletons: null,
      wires: null,
      functions: new Map(),
      registration,
    }

    this.loaded.set(packageName, pkg)
    return pkg
  }

  /**
   * Ensure package services are initialized
   *
   * Lazy initialization - services are created on first use
   *
   * @param packageName - Full package name
   * @param parentServices - Parent singleton services for hydration
   */
  async ensureServicesInitialized(
    packageName: string,
    parentServices: CoreSingletonServices
  ): Promise<void> {
    const pkg = this.loaded.get(packageName)
    if (!pkg) {
      throw new Error(
        `Package not loaded: ${packageName}. Call loadPackage() first.`
      )
    }

    // Already initialized?
    if (pkg.singletons) {
      return
    }

    // Create singleton services
    pkg.singletons = await pkg.registration.createSingletonServices(
      pkg.config,
      parentServices
    )

    // Create wire services template (actual wire services created per-request)
    // This is just to validate the factory function works
    await pkg.registration.createWireServices(pkg.singletons)
  }

  /**
   * Get a function from a package
   *
   * @param packageName - Full package name
   * @param functionName - Function name
   * @returns Function config or null if not found
   */
  getFunction(
    packageName: string,
    functionName: string
  ): CorePikkuFunctionConfig<any, any> | null {
    // Get from pikkuState for this package
    const functions = pikkuState(packageName, 'function', 'functions')
    return functions.get(functionName) ?? null
  }

  /**
   * Get a loaded package
   *
   * @param packageName - Full package name
   * @returns Loaded package or null if not loaded
   */
  getLoadedPackage(packageName: string): LoadedPackage | null {
    return this.loaded.get(packageName) ?? null
  }

  /**
   * Check if a package is registered
   *
   * @param packageName - Full package name
   * @returns true if registered
   */
  isRegistered(packageName: string): boolean {
    return this.packages.has(packageName)
  }

  /**
   * Check if a package is loaded
   *
   * @param packageName - Full package name
   * @returns true if loaded
   */
  isLoaded(packageName: string): boolean {
    return this.loaded.has(packageName)
  }

  /**
   * Check if a package's services are initialized
   *
   * @param packageName - Full package name
   * @returns true if services are initialized
   */
  isInitialized(packageName: string): boolean {
    const pkg = this.loaded.get(packageName)
    return pkg?.singletons !== null && pkg?.singletons !== undefined
  }

  /**
   * Get all registered package names
   *
   * @returns Array of package names
   */
  getRegisteredPackages(): string[] {
    return Array.from(this.packages.keys())
  }

  /**
   * Get all loaded package names
   *
   * @returns Array of package names
   */
  getLoadedPackages(): string[] {
    return Array.from(this.loaded.keys())
  }
}

/**
 * Global package loader singleton
 */
export const packageLoader = new PackageLoader()
