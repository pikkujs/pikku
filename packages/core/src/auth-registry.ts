export interface AuthRegistryProviderEntry {
  id: string
  displayName: string
  secretId: string
}

export interface AuthRegistry {
  providers: AuthRegistryProviderEntry[]
  hasCredentials: boolean
}

let _registry: AuthRegistry = { providers: [], hasCredentials: false }

const cloneRegistry = (registry: AuthRegistry): AuthRegistry => ({
  hasCredentials: registry.hasCredentials,
  providers: registry.providers.map((provider) => ({ ...provider })),
})

export const setAuthRegistry = (registry: AuthRegistry): void => {
  _registry = cloneRegistry(registry)
}

export const getAuthRegistry = (): AuthRegistry => cloneRegistry(_registry)
