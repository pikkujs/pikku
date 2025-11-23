/**
 * Namespace Resolver for External Packages
 *
 * Resolves short namespace aliases to full package names and vice versa.
 *
 * Example config:
 * {
 *   "externalPackages": {
 *     "stripe": "@acme/stripe-functions",
 *     "twilio": "@acme/twilio-functions"
 *   }
 * }
 *
 * Usage:
 * resolver.resolve('stripe:createCharge')
 * // => { package: '@acme/stripe-functions', function: 'createCharge' }
 *
 * resolver.getAlias('@acme/stripe-functions')
 * // => 'stripe'
 */

export interface ResolvedFunction {
  package: string // Full package name: '@acme/stripe-functions'
  function: string // Function name: 'createCharge'
}

export class NamespaceResolver {
  private aliasToPackage: Map<string, string>
  private packageToAlias: Map<string, string>

  constructor(externalPackages: Record<string, string> = {}) {
    this.aliasToPackage = new Map(Object.entries(externalPackages))
    this.packageToAlias = new Map(
      Object.entries(externalPackages).map(([alias, pkg]) => [pkg, alias])
    )
  }

  /**
   * Resolve a namespaced function reference to package and function names
   *
   * @param namespacedFunction - Format: 'namespace:functionName' (e.g., 'stripe:createCharge')
   * @returns Resolved package and function names, or null if namespace not found
   *
   * @example
   * resolver.resolve('stripe:createCharge')
   * // => { package: '@acme/stripe-functions', function: 'createCharge' }
   */
  resolve(namespacedFunction: string): ResolvedFunction | null {
    const colonIndex = namespacedFunction.indexOf(':')
    if (colonIndex === -1) {
      // No namespace - might be a main package function
      return null
    }

    const namespace = namespacedFunction.substring(0, colonIndex)
    const functionName = namespacedFunction.substring(colonIndex + 1)

    const packageName = this.aliasToPackage.get(namespace)
    if (!packageName) {
      return null
    }

    return {
      package: packageName,
      function: functionName,
    }
  }

  /**
   * Get the namespace alias for a package name
   *
   * @param packageName - Full package name (e.g., '@acme/stripe-functions')
   * @returns Namespace alias or null if not found
   *
   * @example
   * resolver.getAlias('@acme/stripe-functions')
   * // => 'stripe'
   */
  getAlias(packageName: string): string | null {
    return this.packageToAlias.get(packageName) ?? null
  }

  /**
   * Get the full package name for an alias
   *
   * @param alias - Namespace alias (e.g., 'stripe')
   * @returns Full package name or null if not found
   *
   * @example
   * resolver.getPackageName('stripe')
   * // => '@acme/stripe-functions'
   */
  getPackageName(alias: string): string | null {
    return this.aliasToPackage.get(alias) ?? null
  }

  /**
   * Check if a namespace alias is registered
   *
   * @param alias - Namespace alias to check
   * @returns true if the alias is registered
   */
  hasAlias(alias: string): boolean {
    return this.aliasToPackage.has(alias)
  }

  /**
   * Check if a package is registered
   *
   * @param packageName - Full package name to check
   * @returns true if the package is registered
   */
  hasPackage(packageName: string): boolean {
    return this.packageToAlias.has(packageName)
  }

  /**
   * Get all registered aliases
   *
   * @returns Array of all namespace aliases
   */
  getAliases(): string[] {
    return Array.from(this.aliasToPackage.keys())
  }

  /**
   * Get all registered packages
   *
   * @returns Array of all full package names
   */
  getPackages(): string[] {
    return Array.from(this.packageToAlias.keys())
  }
}
