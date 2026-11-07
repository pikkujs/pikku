import type {
  FlatScope,
  ScopeDefinitions,
  ScopeDefinitionsMeta,
  ScopeNodeMeta,
} from './scope.types.js'

const SEPARATOR = ':'
const WILDCARD = '*'

const assertSegment = (segment: string, scopeName: string): void => {
  if (segment.includes(SEPARATOR)) {
    throw new Error(
      `Scope segment '${segment}' in '${scopeName}' contains the '${SEPARATOR}' separator. ` +
        `Nest scopes with the 'scopes' property instead of embedding '${SEPARATOR}' in a name.`
    )
  }
  if (segment === WILDCARD) {
    throw new Error(
      `Scope segment '${segment}' in '${scopeName}' is the wildcard. ` +
        `'${WILDCARD}' is reserved for granting a scope and its descendants, and cannot be declared.`
    )
  }
  if (segment.length === 0) {
    throw new Error(`Scope '${scopeName}' contains an empty segment.`)
  }
}

const assertNodesValid = (
  nodes: Record<string, ScopeNodeMeta> | undefined,
  scopeName: string
): void => {
  for (const [segment, node] of Object.entries(nodes ?? {})) {
    assertSegment(segment, scopeName)
    assertNodesValid(node.scopes, scopeName)
  }
}

const flattenNodes = (
  nodes: Record<string, ScopeNodeMeta> | undefined,
  prefix: string,
  out: FlatScope[]
): void => {
  for (const [segment, node] of Object.entries(nodes ?? {})) {
    const id = `${prefix}${SEPARATOR}${segment}`
    out.push({ id, description: node.description })
    flattenNodes(node.scopes, id, out)
  }
}

/** Every node is emitted, intermediate ones included, depth-first. Ids are unique. */
// knowledge: decisions/internals/scope-roots-may-be-co-declared-by-an-addon-and-its-host-app.md
export const flattenScopeDefinitions = (
  definitions: ScopeDefinitions
): FlatScope[] => {
  const out: FlatScope[] = []
  for (const def of definitions) {
    out.push({ id: def.name, description: def.description })
    flattenNodes(def.scopes, def.name, out)
  }
  const seen = new Set<string>()
  return out.filter((scope) => {
    if (seen.has(scope.id)) {
      return false
    }
    seen.add(scope.id)
    return true
  })
}

/** Definitions sharing a name must be identical; a conflicting one is a hard error. */
export function validateAndBuildScopeDefinitionsMeta(
  definitions: ScopeDefinitions
): ScopeDefinitionsMeta {
  const meta: ScopeDefinitionsMeta = {}

  for (const def of definitions) {
    assertSegment(def.name, def.name)
    assertNodesValid(def.scopes, def.name)

    const existing = meta[def.name]
    if (existing) {
      const sameShape =
        JSON.stringify(existing.scopes ?? {}) ===
        JSON.stringify(def.scopes ?? {})
      if (!sameShape) {
        throw new Error(
          `Scope '${def.name}' is declared with different nested scopes.\n` +
            `  First declaration: ${existing.sourceFile ?? 'unknown'}\n` +
            `  Second declaration: ${def.sourceFile ?? 'unknown'}\n` +
            `Scopes sharing a name must declare the same tree.`
        )
      }
      continue
    }

    meta[def.name] = {
      name: def.name,
      displayName: def.displayName,
      description: def.description,
      live: def.live,
      scopes: def.scopes,
      sourceFile: def.sourceFile,
      origin: def.origin,
    }
  }

  return meta
}

const collectLive = (
  nodes: Record<string, ScopeNodeMeta> | undefined,
  prefix: string,
  inherited: boolean,
  out: Set<string>
): void => {
  for (const [segment, node] of Object.entries(nodes ?? {})) {
    const id = `${prefix}${SEPARATOR}${segment}`
    const live = node.live ?? inherited
    if (live) {
      out.add(id)
    }
    collectLive(node.scopes, id, live, out)
  }
}

/** Every scope id that is live, directly or by an ancestor. */
export const liveScopeIds = (definitions: ScopeDefinitions): Set<string> => {
  const out = new Set<string>()
  for (const def of definitions) {
    const live = def.live ?? false
    if (live) {
      out.add(def.name)
    }
    collectLive(def.scopes, def.name, live, out)
  }
  return out
}

/** True when any required scope (`admin:*` counts as `admin`) is in `live`. */
export const requiresLiveScope = (
  required: readonly string[] | undefined,
  live: ReadonlySet<string>
): boolean =>
  (required ?? []).some((scope) =>
    live.has(
      scope.endsWith(`${SEPARATOR}${WILDCARD}`) ? scope.slice(0, -2) : scope
    )
  )
