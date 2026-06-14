import * as ts from 'typescript'

export type ClassifiedField = {
  path: string
  classification: 'private' | 'pii' | 'secret' | string
}

/**
 * Recursively walks a resolved TypeScript type looking for `__classification__` brands —
 * the structural marker emitted by `Private<T>`, `Pii<T>`, and `Secret<T>`.
 *
 * `Private<T> = T & { readonly __classification__: 'private' }` shows up in the TS type
 * system as an intersection whose constituents include a type with a `__classification__`
 * property.  We detect that by checking whether any constituent of an
 * intersection exposes a property named `__classification__`.
 *
 * Returns the list of classified fields found, each with its dotted path and
 * classification level (e.g. `[{ path: 'email', classification: 'private' }]`).
 * An empty array means clean.
 */
export function findPiiPaths(
  checker: ts.TypeChecker,
  type: ts.Type,
  path = '',
  depth = 0,
  seen = new Set<ts.Type>()
): ClassifiedField[] {
  if (depth > 8 || seen.has(type)) return []
  seen.add(type)

  // ── Is this type itself branded? ─────────────────────────────────────────
  // Private<T> = T & { readonly __classification__?: 'private' }  →  isIntersection()
  // where one constituent has a `__classification__` property whose type is a
  // string literal. The marker is OPTIONAL (so plain values stay assignable to
  // branded columns), which means its resolved type is `'private' | undefined` —
  // a union, not a bare literal. Read the level union-aware via `literalString`,
  // otherwise pii/secret silently downgrade to the `'private'` fallback.
  if (type.isIntersection()) {
    for (const t of type.types) {
      const classificationProp = t
        .getProperties()
        .find((p) => p.name === '__classification__')
      if (classificationProp) {
        const decl =
          classificationProp.valueDeclaration ??
          classificationProp.declarations?.[0]
        const classification = decl
          ? (literalString(
              checker.getTypeOfSymbolAtLocation(classificationProp, decl)
            ) ?? 'private')
          : 'private'
        return [{ path: path || '<return value>', classification }]
      }
    }
  }

  const violations: ClassifiedField[] = []

  // ── Union: check every branch ─────────────────────────────────────────────
  if (type.isUnion()) {
    for (const branch of type.types) {
      violations.push(...findPiiPaths(checker, branch, path, depth, seen))
    }
    return violations
  }

  // ── Object: recurse into named properties ─────────────────────────────────
  if (type.flags & ts.TypeFlags.Object) {
    const ref = type as ts.TypeReference
    for (const arg of (ref as any).typeArguments ?? []) {
      violations.push(...findPiiPaths(checker, arg, path, depth + 1, seen))
    }

    const numberIndex = checker.getIndexTypeOfType(type, ts.IndexKind.Number)
    if (numberIndex) {
      const idxPath = path ? `${path}[]` : '[]'
      violations.push(
        ...findPiiPaths(checker, numberIndex, idxPath, depth + 1, seen)
      )
    }
    const stringIndex = checker.getIndexTypeOfType(type, ts.IndexKind.String)
    if (stringIndex) {
      const idxPath = path ? `${path}[*]` : '[*]'
      violations.push(
        ...findPiiPaths(checker, stringIndex, idxPath, depth + 1, seen)
      )
    }

    for (const prop of type.getProperties()) {
      if (prop.name.startsWith('__')) continue
      const decl = prop.valueDeclaration ?? prop.declarations?.[0]
      if (!decl) continue
      const propType = checker.getTypeOfSymbolAtLocation(prop, decl)
      const subPath = path ? `${path}.${prop.name}` : prop.name
      violations.push(
        ...findPiiPaths(checker, propType, subPath, depth + 1, seen)
      )
    }
  }

  return violations
}

/**
 * Recover a string-literal value from a type that may be the literal itself or a
 * union containing it (e.g. `'private' | undefined`, produced by the optional
 * `__classification__?` marker). Returns undefined when no string literal is
 * present so the caller can apply its own fallback.
 */
function literalString(type: ts.Type): string | undefined {
  const value = (type as { value?: unknown }).value
  if (typeof value === 'string') return value
  if (type.isUnion()) {
    for (const member of type.types) {
      const found = literalString(member)
      if (found !== undefined) return found
    }
  }
  return undefined
}
