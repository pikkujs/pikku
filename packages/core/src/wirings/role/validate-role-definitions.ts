import type {
  SystemRole,
  SystemRoleDefinitions,
  SystemRoleDefinitionsMeta,
} from './role.types.js'

const SEPARATOR = ':'

const assertRoleName = (name: string): void => {
  if (name.length === 0) {
    throw new Error('A system role is declared with an empty name.')
  }
  if (name.includes(SEPARATOR)) {
    throw new Error(
      `System role '${name}' contains the '${SEPARATOR}' separator. ` +
        `'${SEPARATOR}' delimits scope ids; a role named like a scope reads as one.`
    )
  }
}

/**
 * The declared roles as a flat list, deduplicated by name.
 *
 * A role may legitimately be declared more than once — an addon and its host
 * app both contributing `admin`, say — and
 * {@link validateAndBuildSystemRoleDefinitionsMeta} has already guaranteed
 * those declarations are identical, so the second is redundant rather than
 * conflicting. Collapsing here keeps codegen (which emits an object literal
 * keyed by name) and a ScopeService (which syncs one row per role) honest.
 */
export const flattenSystemRoleDefinitions = (
  definitions: SystemRoleDefinitions
): SystemRole[] => {
  const seen = new Set<string>()
  const out: SystemRole[] = []
  for (const def of definitions) {
    if (seen.has(def.name)) {
      continue
    }
    seen.add(def.name)
    out.push({
      name: def.name,
      displayName: def.displayName,
      description: def.description,
      scopes: [...def.scopes],
    })
  }
  return out
}

/**
 * Validates declared system roles and keys them by name.
 *
 * Definitions sharing a name must grant the same scope set; a conflicting
 * redeclaration is a hard error naming both source files. Order within
 * `scopes` is not significant — two declarations listing the same scopes
 * differently are the same role.
 */
export function validateAndBuildSystemRoleDefinitionsMeta(
  definitions: SystemRoleDefinitions
): SystemRoleDefinitionsMeta {
  const meta: SystemRoleDefinitionsMeta = {}

  for (const def of definitions) {
    assertRoleName(def.name)

    const existing = meta[def.name]
    if (existing) {
      const sameScopes =
        JSON.stringify([...existing.scopes].sort()) ===
        JSON.stringify([...def.scopes].sort())
      if (!sameScopes) {
        throw new Error(
          `System role '${def.name}' is declared with different scopes.\n` +
            `  First declaration: ${existing.sourceFile ?? 'unknown'}\n` +
            `  Second declaration: ${def.sourceFile ?? 'unknown'}\n` +
            `Roles sharing a name must grant the same scopes.`
        )
      }
      continue
    }

    meta[def.name] = {
      name: def.name,
      displayName: def.displayName,
      description: def.description,
      scopes: [...def.scopes],
      sourceFile: def.sourceFile,
    }
  }

  return meta
}
