export interface PackageMeta {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  author: string
  icon?: string
  tags: string[]
  categories: string[]
  functions: Record<string, unknown>
  agents: Record<string, unknown>
  // API-only fields (populated when this entry came from the OpenAPI catalogue,
  // via apiToPackageMeta in ApisList) — undefined for regular addons.
  swaggerUrl?: string
  totalOperations?: number
}

export type AddonFilter = 'all' | 'official' | 'installed'

/** One page of the addon catalogue, as the registry returns it. */
export interface CataloguePage {
  packages: PackageMeta[]
  total: number
  nextCursor: number | null
}

export const PAGE_SIZE = 50

// A locally-wired addon as reported by console:getInstalledAddons. It may not
// exist in the remote catalogue at all (e.g. a private or first-party addon
// that was never published to the gallery).
export interface InstalledAddonRow {
  namespace: string
  packageName: string
  functionCount: number
  agentCount: number
  icon?: string
  tags?: string[]
}

// Synthesise a gallery card for an installed addon that has no catalogue entry,
// so the Installed view can still list it (name/version/description come from
// the catalogue when available, otherwise we show what getInstalledAddons knows).
export const installedToPackageMeta = (a: InstalledAddonRow): PackageMeta => ({
  id: a.packageName,
  name: a.packageName,
  displayName: a.namespace || a.packageName,
  description: '',
  version: '',
  author: '',
  icon: a.icon,
  tags: a.tags ?? [],
  categories: [],
  functions: {},
  agents: {},
})
