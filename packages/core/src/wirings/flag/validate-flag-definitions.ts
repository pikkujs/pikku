import type {
  DeclaredFlag,
  FeatureFlagDefinitions,
  FeatureFlagDefinitionsMeta,
  FlagConfigSnapshot,
} from './flag.types.js'

const SEPARATOR = ':'

const assertFlagName = (name: string): void => {
  if (name.length === 0) {
    throw new Error('A feature flag is declared with an empty name.')
  }
  if (name.includes(SEPARATOR)) {
    throw new Error(
      `Feature flag '${name}' contains the '${SEPARATOR}' separator. ` +
        `'${SEPARATOR}' delimits scope ids; a flag named like a scope reads as one.`
    )
  }
}

/**
 * The declared flags as a flat list, deduplicated by name.
 *
 * A flag may legitimately be declared more than once — an addon and its host
 * app both contributing one — and
 * {@link validateAndBuildFeatureFlagDefinitionsMeta} has already guaranteed
 * those declarations are identical.
 */
export const flattenFeatureFlagDefinitions = (
  definitions: FeatureFlagDefinitions
): DeclaredFlag[] => {
  const seen = new Set<string>()
  const out: DeclaredFlag[] = []
  for (const def of definitions) {
    if (seen.has(def.name)) {
      continue
    }
    seen.add(def.name)
    out.push({
      name: def.name,
      description: def.description,
      anyOf: def.anyOf ? [...def.anyOf] : undefined,
    })
  }
  return out
}

/**
 * Validates declared flags and keys them by name.
 *
 * Definitions sharing a name must name the same scope set; a conflicting
 * redeclaration is a hard error naming both source files. Order within `anyOf`
 * is not significant.
 */
export function validateAndBuildFeatureFlagDefinitionsMeta(
  definitions: FeatureFlagDefinitions
): FeatureFlagDefinitionsMeta {
  const meta: FeatureFlagDefinitionsMeta = {}

  for (const def of definitions) {
    assertFlagName(def.name)

    if (def.anyOf && def.anyOf.length === 0) {
      throw new Error(
        `Feature flag '${def.name}' declares 'anyOf: []'. ` +
          `An empty list satisfies nobody, which is never what is meant: ` +
          `omit 'anyOf' for a pure switch, or name the scopes that reveal it.`
      )
    }

    const existing = meta[def.name]
    if (existing) {
      const sameScopes =
        JSON.stringify([...(existing.anyOf ?? [])].sort()) ===
        JSON.stringify([...(def.anyOf ?? [])].sort())
      if (!sameScopes) {
        throw new Error(
          `Feature flag '${def.name}' is declared with different scopes.\n` +
            `  First declaration: ${existing.sourceFile ?? 'unknown'}\n` +
            `  Second declaration: ${def.sourceFile ?? 'unknown'}\n` +
            `Flags sharing a name must name the same scopes.`
        )
      }
      continue
    }

    meta[def.name] = {
      name: def.name,
      description: def.description,
      anyOf: def.anyOf ? [...def.anyOf] : undefined,
      sourceFile: def.sourceFile,
    }
  }

  return meta
}

/**
 * The snapshot a flag source falls back to when its store cannot be read: every
 * declared flag on, no rollout, no overrides.
 *
 * This is the compiled declaration, not a database read — putting a fallback
 * query on the request path is how a slow store becomes a slow product.
 */
export const compiledFallbackSnapshot = (
  flags: DeclaredFlag[]
): FlagConfigSnapshot =>
  Object.fromEntries(
    flags.map((flag) => [
      flag.name,
      { enabled: true, rolloutPercent: null, overrides: {} },
    ])
  )
