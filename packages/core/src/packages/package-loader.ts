/**
 * Package Loader
 *
 * Central registry for external Pikku packages.
 * Handles package registration, lazy initialization, and function access.
 */

import type { CoreSingletonServices } from '../types/core.types.js'
import type { LoadedPackage } from './package-loader.types.js'

export class PackageLoader {
  private loaded = new Map<string, LoadedPackage<any, any, any>>()

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
   * Get a loaded package
   *
   * @param packageName - Full package name
   * @returns Loaded package or null if not loaded
   */
  getLoadedPackage(packageName: string): LoadedPackage | null {
    return this.loaded.get(packageName) ?? null
  }
}

/**
 * Global package loader singleton
 */
export const packageLoader = new PackageLoader()
