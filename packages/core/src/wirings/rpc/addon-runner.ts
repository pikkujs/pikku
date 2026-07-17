import { pikkuState } from '../../pikku-state.js'
import type {
  CoreConfig,
  CoreSingletonServices,
} from '../../types/core.types.js'
import type { SecretService } from '../../services/secret-service.js'
import type { VariablesService } from '../../services/variables-service.js'

/**
 * A single wired addon instance: a namespace (wireAddon `name`) plus the
 * per-instance name-aliases that remap the logical names the addon reads to
 * the actual project secret/variable/credential names.
 */
export type AddonInstance = {
  namespace: string
  secretOverrides?: Record<string, string>
  variableOverrides?: Record<string, string>
  credentialOverrides?: Record<string, string>
}

/**
 * Wrap a SecretService so that the logical secret names an addon reads are
 * remapped to the actual project secret names via the instance's overrides.
 */
const aliasSecretService = (
  secrets: SecretService,
  overrides: Record<string, string>
): SecretService => {
  const map = (key: string) => overrides[key] ?? key
  return {
    getSecret: <T = string>(key: string) => secrets.getSecret<T>(map(key)),
    hasSecret: (key: string) => secrets.hasSecret(map(key)),
    setSecret: (key: string, value: unknown) =>
      secrets.setSecret(map(key), value),
    deleteSecret: (key: string) => secrets.deleteSecret(map(key)),
    getSecrets: async (keys) => {
      const result = await secrets.getSecrets(keys.map(map))
      const out: Record<string, unknown> = {}
      for (const logical of keys) {
        const real = map(logical)
        if (real in result)
          out[logical] = (result as Record<string, unknown>)[real]
      }
      return out as never
    },
  }
}

/**
 * Wrap a VariablesService so that the logical variable names an addon reads
 * are remapped to the actual project variable names via the instance's overrides.
 */
const aliasVariablesService = (
  variables: VariablesService,
  overrides: Record<string, string>
): VariablesService => {
  const map = (name: string) => overrides[name] ?? name
  return {
    get: <T = string>(name: string) => variables.get<T>(map(name)),
    getVariables: (names) => {
      const result = variables.getVariables(names.map(map) as never)
      const remap = (r: Record<string, unknown>) => {
        const out: Record<string, unknown> = {}
        for (const logical of names) {
          const real = map(logical)
          if (real in r) out[logical] = r[real]
        }
        return out
      }
      return result instanceof Promise
        ? (result.then(remap) as never)
        : (remap(result as Record<string, unknown>) as never)
    },
    getAll: () => variables.getAll(),
    set: (name: string, value: unknown) => variables.set(map(name), value),
    has: (name: string) => variables.has(map(name)),
    delete: (name: string) => variables.delete(map(name)),
  }
}

/**
 * Find the consumer-defined namespace (from wireAddon) for a given addon package.
 * Returns null if the package isn't registered as an addon.
 */
const findAddonNamespaceForPackage = (packageName: string): string | null => {
  const addons = pikkuState(null, 'addons', 'packages')
  if (!addons) return null
  for (const [namespace, cfg] of addons.entries()) {
    if (cfg?.package === packageName) return namespace
  }
  return null
}

/**
 * Wrap a workflow service so that bare workflow names passed from inside an
 * addon function are auto-prefixed with the addon's consumer-facing namespace.
 * Without this, `runToCompletion('myWorkflow')` from inside an addon misses
 * the workflow registered under the addon's package scope and throws
 * WorkflowNotFoundError — forcing addons to hardcode their consumer-defined
 * namespace, which couples the addon to its caller.
 *
 * Explicit `'ns:name'` and bare names that already exist in root meta are
 * unaffected; only bare names that would otherwise miss resolution get
 * prefixed.
 */
const wrapWorkflowServiceForPackage = <T extends object>(
  service: T,
  packageName: string,
  namespace: string | null
): T => {
  return new Proxy(service, {
    get(target, prop, receiver) {
      if (prop === 'startWorkflow' || prop === 'runToCompletion') {
        const original = Reflect.get(target, prop, receiver) as Function
        return function (this: any, name: string, ...rest: any[]) {
          if (typeof name === 'string' && !name.includes(':')) {
            // Prefer the known instance namespace; fall back to the
            // package's sole namespace when invoked without an instance.
            const ns = namespace ?? findAddonNamespaceForPackage(packageName)
            if (ns) {
              name = `${ns}:${name}`
            }
          }
          return original.call(this, name, ...rest)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

/**
 * Get or create singleton services for an addon instance.
 * Services are cached in pikkuState to avoid recreation on each call.
 *
 * @param packageName - The addon package name
 * @param parentServices - The parent/caller's singleton services (used as base)
 * @param addonInstance - The wired instance whose overrides shape the services
 * @returns The instance's singleton services
 */
export const getOrCreatePackageSingletonServices = async (
  packageName: string,
  parentServices: CoreSingletonServices,
  addonInstance?: AddonInstance
): Promise<CoreSingletonServices> => {
  // Cache per instance (namespace), not per package, so two instances of one
  // package get separate services built with their own overrides. A bare
  // package-scoped call (no instance) falls back to per-package caching.
  const cacheKey = addonInstance?.namespace ?? packageName

  const cachedServices = pikkuState(cacheKey, 'package', 'singletonServices')
  if (cachedServices) {
    return cachedServices
  }

  const factories = pikkuState(packageName, 'package', 'factories')
  if (!factories || !factories.createSingletonServices) {
    // No factories registered, use parent services
    return parentServices
  }

  // Apply this instance's secret/variable overrides by aliasing the resolver
  // services the addon reads from, so its createSingletonServices resolves
  // instance-specific secrets/variables.
  let existingServices = parentServices
  if (addonInstance?.secretOverrides && parentServices.secrets) {
    existingServices = {
      ...existingServices,
      secrets: aliasSecretService(
        parentServices.secrets,
        addonInstance.secretOverrides
      ),
    }
  }
  if (addonInstance?.variableOverrides && parentServices.variables) {
    existingServices = {
      ...existingServices,
      variables: aliasVariablesService(
        parentServices.variables,
        addonInstance.variableOverrides
      ),
    }
  }

  // Create config for the package (use parent config if no factory)
  let config: CoreConfig = existingServices.config
  if (factories.createConfig) {
    config = await factories.createConfig(existingServices.variables)
  }

  // Create singleton services for the package, passing parent services as existing
  const packageServices = await factories.createSingletonServices(
    config,
    existingServices
  )

  // Wrap workflowService so that bare names used inside the addon's functions
  // resolve to workflows registered under the addon's package scope.
  if (
    packageServices.workflowService &&
    typeof packageServices.workflowService === 'object'
  ) {
    packageServices.workflowService = wrapWorkflowServiceForPackage(
      packageServices.workflowService as object,
      packageName,
      addonInstance?.namespace ?? null
    ) as typeof packageServices.workflowService
  }

  pikkuState(cacheKey, 'package', 'singletonServices', packageServices)

  return packageServices
}

/**
 * Build the addon instance descriptor (namespace + per-instance overrides) for
 * a bare intra-addon call, using the namespace currently executing on the wire.
 * Returns undefined unless that namespace maps to the resolved package.
 */
export const addonInstanceForNamespace = (
  namespace: string | undefined,
  expectedPackage: string
): AddonInstance | undefined => {
  if (!namespace) return undefined
  const cfg = pikkuState(null, 'addons', 'packages').get(namespace)
  if (!cfg || cfg.package !== expectedPackage) return undefined
  return {
    namespace,
    secretOverrides: cfg.secretOverrides,
    variableOverrides: cfg.variableOverrides,
    credentialOverrides: cfg.credentialOverrides,
  }
}
