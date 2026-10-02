import type { ScopeDefinitionsMeta } from '@pikku/core/scope'
import type { DeclaredScope } from './scope-tree'

export type ScopeGroup = { head: DeclaredScope; leaves: DeclaredScope[] }

export type ScopeArea = {
  id: string
  displayName?: string
  description?: string
  root?: DeclaredScope
  groups: ScopeGroup[]
  all: DeclaredScope[]
}

/**
 * Who put a set of permissions into the app. `other` is a declared tree the
 * meta says nothing about — a backend older than the origin field — and
 * `removed` is a tree nothing declares any more, held only by the store.
 */
export type ScopeSource =
  | { kind: 'app'; key: string; areas: ScopeArea[] }
  | { kind: 'generated'; key: string; areas: ScopeArea[] }
  | {
      kind: 'addon'
      key: string
      package: string
      displayName?: string
      areas: ScopeArea[]
    }
  | { kind: 'other'; key: string; areas: ScopeArea[] }
  | { kind: 'removed'; key: string; areas: ScopeArea[] }

const rootOf = (id: string) => id.split(':')[0]!

const covers = (held: string, id: string) =>
  held === id || id.startsWith(`${held}:`)

/** The role filter's value for "given to nobody". */
export const NO_ROLE = '__no_role__'

const keepsScope = (
  roles: Array<{ name: string; scopes: string[] }>,
  role: string,
  id: string
) => {
  const holders = roles.filter((entry) =>
    entry.scopes.some((held) => covers(held, id))
  )
  return role === NO_ROLE
    ? holders.length === 0
    : holders.some((entry) => entry.name === role)
}

/**
 * Narrows the scopes to those matching the search and the role filter, keeping
 * the root and group heading above every match so it still reads under its own
 * section rather than as an orphan line.
 */
export const filterScopes = (
  scopes: DeclaredScope[],
  {
    search,
    role,
    roles,
  }: {
    search: string
    role: string | null
    roles?: Array<{ name: string; scopes: string[] }>
  }
): DeclaredScope[] => {
  const needle = search.trim().toLowerCase()
  if (!needle && (!role || !roles)) return scopes
  const matches = scopes.filter(
    (scope) =>
      (!needle ||
        scope.id.toLowerCase().includes(needle) ||
        (scope.description ?? '').toLowerCase().includes(needle)) &&
      (!role || !roles || keepsScope(roles, role, scope.id))
  )
  const kept = new Set(matches.map((scope) => scope.id))
  for (const scope of matches) {
    const [root, group] = scope.id.split(':')
    kept.add(root!)
    if (group) kept.add(`${root}:${group}`)
  }
  return scopes.filter((scope) => kept.has(scope.id))
}

export const toAreas = (
  scopes: DeclaredScope[],
  meta: ScopeDefinitionsMeta = {}
): ScopeArea[] => {
  const areas = new Map<string, ScopeArea>()
  for (const scope of scopes) {
    const [areaId, groupId] = scope.id.split(':')
    let area = areas.get(areaId!)
    if (!area) {
      area = {
        id: areaId!,
        displayName: meta[areaId!]?.displayName,
        description: meta[areaId!]?.description,
        groups: [],
        all: [],
      }
      areas.set(areaId!, area)
    }
    area.all.push(scope)
    if (!groupId) {
      area.root = scope
      continue
    }
    const headId = `${areaId}:${groupId}`
    let group = area.groups.find((entry) => entry.head.id === headId)
    if (!group) {
      group = {
        head: scopes.find((entry) => entry.id === headId) ?? {
          id: headId,
          declared: true,
        },
        leaves: [],
      }
      area.groups.push(group)
    }
    if (scope.id !== headId) group.leaves.push(scope)
  }
  return [...areas.values()]
}

export const permissionCount = (area: ScopeArea) =>
  area.groups.reduce(
    (sum, group) => sum + Math.max(group.leaves.length, 1),
    0
  ) || (area.root ? 1 : 0)

export const sourcePermissionCount = (source: ScopeSource) =>
  source.areas.reduce((sum, area) => sum + permissionCount(area), 0)

const isFirstParty = (packageName: string) => packageName.startsWith('@pikku/')

const addonTitle = (source: Extract<ScopeSource, { kind: 'addon' }>) =>
  source.displayName ?? source.package

/**
 * Groups the grantable scopes by who declared their tree: the app first, then
 * what the CLI generated into it, then each addon — Pikku's own before anyone
 * else's, each alphabetical — then anything the meta cannot place, and last
 * the trees nothing declares any more.
 */
export const groupScopesBySource = (
  scopes: DeclaredScope[],
  meta: ScopeDefinitionsMeta
): ScopeSource[] => {
  const byRoot = new Map<string, DeclaredScope[]>()
  for (const scope of scopes) {
    const root = rootOf(scope.id)
    byRoot.set(root, [...(byRoot.get(root) ?? []), scope])
  }

  const sources = new Map<string, ScopeSource>()
  const sourceFor = (root: string, rootScopes: DeclaredScope[]) => {
    const origin = meta[root]?.origin
    if (!origin) {
      return rootScopes.every((scope) => !scope.declared)
        ? { kind: 'removed' as const, key: 'removed' }
        : { kind: 'other' as const, key: 'other' }
    }
    if (origin.kind === 'addon') {
      return {
        kind: 'addon' as const,
        key: `addon:${origin.package}`,
        package: origin.package,
        displayName: origin.displayName,
      }
    }
    return { kind: origin.kind, key: origin.kind }
  }

  for (const [root, rootScopes] of byRoot) {
    const identity = sourceFor(root, rootScopes)
    const source =
      sources.get(identity.key) ?? ({ ...identity, areas: [] } as ScopeSource)
    sources.set(identity.key, source)
    source.areas.push(...toAreas(rootScopes, meta))
  }

  const rank = (source: ScopeSource) =>
    ({ app: 0, generated: 1, addon: 2, other: 3, removed: 4 })[source.kind]

  return [...sources.values()].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (a.kind !== 'addon' || b.kind !== 'addon') return 0
    if (isFirstParty(a.package) !== isFirstParty(b.package)) {
      return isFirstParty(a.package) ? -1 : 1
    }
    return addonTitle(a).localeCompare(addonTitle(b))
  })
}
