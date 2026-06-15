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

export const setAuthRegistry = (registry: AuthRegistry): void => {
  _registry = registry
}

export const getAuthRegistry = (): AuthRegistry => _registry
