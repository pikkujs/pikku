import * as ts from 'typescript'

/**
 * Recursively walks a resolved TypeScript type looking for `__pii__` brands —
 * the structural marker emitted by `Private<T>` and `Secret<T>`.
 *
 * `Private<T> = T & { readonly __pii__: 'private' }` shows up in the TS type
 * system as an intersection whose constituents include a type with a `__pii__`
 * property.  We detect that by checking whether any constituent of an
 * intersection exposes a property named `__pii__`.
 *
 * Returns the list of dotted field paths where a brand was found
 * (e.g. `['email', 'address.phone']`).  An empty array means clean.
 */
export function findPiiPaths(
  checker: ts.TypeChecker,
  type: ts.Type,
  path = '',
  depth = 0,
  seen = new Set<ts.Type>()
): string[] {
  if (depth > 8 || seen.has(type)) return []
  seen.add(type)

  // ── Is this type itself branded? ─────────────────────────────────────────
  // Private<T> = T & { readonly __pii__: 'private' }  →  isIntersection()
  // where one constituent has a `__pii__` property.
  if (type.isIntersection()) {
    const branded = type.types.some((t) =>
      t.getProperties().some((p) => p.name === '__pii__')
    )
    if (branded) {
      return [path || '<return value>']
    }
  }

  const violations: string[] = []

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
      violations.push(...findPiiPaths(checker, numberIndex, idxPath, depth + 1, seen))
    }
    const stringIndex = checker.getIndexTypeOfType(type, ts.IndexKind.String)
    if (stringIndex) {
      const idxPath = path ? `${path}[*]` : '[*]'
      violations.push(...findPiiPaths(checker, stringIndex, idxPath, depth + 1, seen))
    }

    for (const prop of type.getProperties()) {
      if (prop.name.startsWith('__')) continue
      const decl = prop.valueDeclaration ?? prop.declarations?.[0]
      if (!decl) continue
      const propType = checker.getTypeOfSymbolAtLocation(prop, decl)
      const subPath = path ? `${path}.${prop.name}` : prop.name
      violations.push(...findPiiPaths(checker, propType, subPath, depth + 1, seen))
    }
  }

  return violations
}
