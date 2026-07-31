import { pikkuState } from '../../pikku-state.js'
import type {
  CoreConfig,
  CoreSingletonServices,
} from '../../types/core.types.js'
import type { SecretService } from '../../services/secret-service.js'
import type { VariablesService } from '../../services/variables-service.js'

export type AddonInstance = {
  namespace: string
  secretOverrides?: Record<string, string>
  variableOverrides?: Record<string, string>
  credentialOverrides?: Record<string, string>
}

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

const findAddonNamespaceForPackage = (packageName: string): string | null => {
  const addons = pikkuState(null, 'addons', 'packages')
  if (!addons) return null
  for (const [namespace, cfg] of addons.entries()) {
    if (cfg?.package === packageName) return namespace
  }
  return null
}

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

export const getOrCreatePackageSingletonServices = async (
  packageName: string,
  parentServices: CoreSingletonServices,
  addonInstance?: AddonInstance
): Promise<CoreSingletonServices> => {
  const cacheKey = addonInstance?.namespace ?? packageName

  const cachedServices = pikkuState(cacheKey, 'package', 'singletonServices')
  if (cachedServices) {
    return cachedServices
  }

  const factories = pikkuState(packageName, 'package', 'factories')
  if (!factories || !factories.createSingletonServices) {
    return parentServices
  }

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

  let config: CoreConfig = existingServices.config
  if (factories.createConfig) {
    config = await factories.createConfig(existingServices.variables)
  }

  const packageServices = await factories.createSingletonServices(
    config,
    existingServices
  )

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
