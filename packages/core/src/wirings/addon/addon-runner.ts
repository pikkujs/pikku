import { pikkuState } from '../../pikku-state.js'
import type {
  CoreConfig,
  CoreSingletonServices,
} from '../../types/core.types.js'
import type { SecretService } from '../../services/secret-service.js'
import { ScopedSecretService } from '../../services/scoped-secret-service.js'
import { ScopedCredentialService } from '../../services/scoped-credential-service.js'
import { ScopedContentService } from '../../services/scoped-content-service.js'
import type { CredentialOverrides } from '../credential/credential-overrides.js'
import type { VariablesService } from '../../services/variables-service.js'
import type { SendWebhookInput } from '../../services/webhook-service.js'

export type AddonInstance = {
  namespace: string
  secretOverrides?: Record<string, string>
  variableOverrides?: Record<string, string>
  credentialOverrides?: CredentialOverrides
  /** Set by the consuming app: secrets it lends this instance, as the addon names them. */
  secretGrants?: string[]
  /** Set by the consuming app: credentials it lends this instance, as the addon names them. */
  credentialGrants?: string[]
  /** Set by the consuming app to opt this instance out of secret scoping. */
  globalSecrets?: string
  /** Set by the consuming app to opt this instance out of credential scoping. */
  globalCredentials?: string
  /** Set by the consuming app: the folder of the content store this instance owns. */
  contentBucket?: string
  /** Set by the consuming app: paths outside its folder this instance may read or write. */
  contentGrants?: Record<string, 'read' | 'write'>
  /** Set by the consuming app to opt this instance out of content scoping. */
  globalContent?: string
}

/**
 * What the addon declared, plus what the host lent it. Scoping runs outside the
 * aliaser, so every name here is the one the addon reads — which is why an
 * override's *key* grants, and its value does not.
 */
const allowedNames = (
  declared: string[] | null | undefined,
  grants: string[] | undefined,
  overrides: Record<string, unknown> | undefined
): Set<string> =>
  new Set([
    ...(declared ?? []),
    ...(grants ?? []),
    ...Object.keys(overrides ?? {}),
  ])

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

const scopedWebhookServices = new WeakSet<object>()

/** An addon names its outgoing events locally; they leave as `<instance>:<event>`. */
const scopeWebhookService = <T extends object>(
  service: T,
  namespace: string
): T => {
  if (scopedWebhookServices.has(service)) return service
  const scoped = new Proxy(service, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop !== 'send' || typeof value !== 'function') return value
      return function (this: any, input: SendWebhookInput, ...rest: any[]) {
        return value.call(
          this,
          input?.event && !input.event.startsWith(`${namespace}:`)
            ? { ...input, event: `${namespace}:${input.event}` }
            : input,
          ...rest
        )
      }
    },
  })
  scopedWebhookServices.add(scoped)
  return scoped
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
  if (!addonInstance?.globalSecrets && existingServices.secrets) {
    existingServices = {
      ...existingServices,
      secrets: new ScopedSecretService(
        existingServices.secrets,
        allowedNames(
          pikkuState(packageName, 'package', 'declaredSecrets'),
          addonInstance?.secretGrants,
          addonInstance?.secretOverrides
        )
      ),
    }
  }
  if (!addonInstance?.globalCredentials && existingServices.credentialService) {
    existingServices = {
      ...existingServices,
      credentialService: new ScopedCredentialService(
        existingServices.credentialService,
        allowedNames(
          Object.keys(
            pikkuState(packageName, 'package', 'credentialsMeta') ?? {}
          ),
          addonInstance?.credentialGrants,
          addonInstance?.credentialOverrides
        )
      ),
    }
  }

  const namespace =
    addonInstance?.namespace ?? findAddonNamespaceForPackage(packageName)
  if (!addonInstance?.globalContent && existingServices.content) {
    existingServices = {
      ...existingServices,
      content: new ScopedContentService(
        existingServices.content,
        addonInstance?.contentBucket ??
          namespace ??
          packageName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, ''),
        addonInstance?.contentGrants
      ),
    }
  }
  if (namespace && existingServices.webhookService) {
    existingServices = {
      ...existingServices,
      webhookService: scopeWebhookService(
        existingServices.webhookService,
        namespace
      ),
    }
  }

  if (!factories || !factories.createSingletonServices) {
    return existingServices
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

  if (namespace && packageServices.webhookService) {
    packageServices.webhookService = scopeWebhookService(
      packageServices.webhookService,
      namespace
    )
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
    secretGrants: cfg.secretGrants,
    credentialGrants: cfg.credentialGrants,
    globalSecrets: cfg.globalSecrets,
    globalCredentials: cfg.globalCredentials,
    contentBucket: cfg.contentBucket,
    contentGrants: cfg.contentGrants,
    globalContent: cfg.globalContent,
  }
}
