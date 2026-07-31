import { pikkuState } from '../../pikku-state.js'

export type WireAddonConfig = {
  name: string
  package: string
  rpcEndpoint?: string
  auth?: boolean
  mcp?: boolean
  tags?: string[]
  /** Required of every function in the addon, on top of the function's own. */
  scopes?: string[]
  secretOverrides?: Record<string, string>
  variableOverrides?: Record<string, string>
  credentialOverrides?: Record<string, string>
}

export const wireAddon = (config: WireAddonConfig): void => {
  pikkuState(null, 'addons', 'packages').set(config.name, {
    package: config.package,
    rpcEndpoint: config.rpcEndpoint,
    auth: config.auth,
    tags: config.tags,
    ...(config.scopes ? { scopes: config.scopes } : {}),
    ...(config.secretOverrides
      ? { secretOverrides: config.secretOverrides }
      : {}),
    ...(config.variableOverrides
      ? { variableOverrides: config.variableOverrides }
      : {}),
    ...(config.credentialOverrides
      ? { credentialOverrides: config.credentialOverrides }
      : {}),
  })
}

/**
 * knowledge: decisions/security/addon-scopes-are-resolved-where-the-function-runs.md
 */
export const resolveAddonScopes = (
  packageName: string | null,
  namespace?: string
): string[] => {
  if (!packageName) {
    return []
  }

  const addons = pikkuState(null, 'addons', 'packages')
  if (!addons) {
    return []
  }

  if (namespace) {
    const config = addons.get(namespace)
    if (config?.package === packageName) {
      return config.scopes ?? []
    }
  }

  const scopes = new Set<string>()
  for (const config of addons.values()) {
    if (config?.package !== packageName) {
      continue
    }
    for (const scope of config.scopes ?? []) {
      scopes.add(scope)
    }
  }
  return [...scopes]
}
