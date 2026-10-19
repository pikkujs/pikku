import type { TypesMap } from '../types-map.js'

/**
 * A type declared in `@pikku/core` is part of the SDK's allowed import set, so
 * naming one (an MCP response, say) does not drag the addon's source along.
 */
const isPikkuCorePath = (path: string): boolean =>
  /[\\/]@pikku[\\/]core[\\/]/.test(path) ||
  /[\\/]packages[\\/]core[\\/]/.test(path)

/**
 * The named, source-declared types a function's input or output resolves to:
 * every name the typed maps would have to import rather than declare inline.
 * A custom alias (a union, an array of rows) is followed through to the names
 * it references.
 */
export const namedSourceTypes = (
  typesMap: TypesMap,
  names: string[]
): string[] => {
  const found = new Set<string>()
  const visit = (name: string, seen: Set<string>) => {
    if (seen.has(name)) return
    seen.add(name)
    const custom = typesMap.customTypes.get(name)
    if (custom) {
      for (const ref of custom.references) visit(ref, seen)
      return
    }
    let path: string | null = null
    let originalName = name
    try {
      const meta = typesMap.getTypeMeta(name)
      path = meta.path
      originalName = meta.originalName
    } catch {
      return
    }
    if (path && !isPikkuCorePath(path)) found.add(originalName)
  }
  for (const name of names) visit(name, new Set())
  return [...found].sort()
}

export interface AddonContractTypeSource {
  name: string
  usesGenerics: boolean
  hasInputSchema: boolean
  hasOutputSchema: boolean
  inputNames: string[]
  outputNames: string[]
}

/**
 * Why a `remote: true` addon function cannot ship in an SDK, or null when it
 * can. Its input and output have to be zod schemas: a TS generic or a named
 * source type makes codegen emit `import type { X } from '../../../src/...'`
 * into the remote map, a path that does not exist on the consumer's machine.
 */
export const addonZodContractViolation = (
  typesMap: TypesMap,
  fn: AddonContractTypeSource
): string | null => {
  const problems: string[] = []
  if (fn.usesGenerics) {
    problems.push('declares its input/output with TypeScript generics')
  }
  const named = [
    ...(fn.hasInputSchema ? [] : namedSourceTypes(typesMap, fn.inputNames)),
    ...(fn.hasOutputSchema ? [] : namedSourceTypes(typesMap, fn.outputNames)),
  ]
  if (named.length > 0) {
    problems.push(
      `types its input/output with named source types (${[...new Set(named)].join(', ')})`
    )
  }
  if (problems.length === 0) return null
  return (
    `Addon function '${fn.name}' is remote: true but ${problems.join(' and ')}. ` +
    `A remote addon's contract ships as a types-only SDK, so its input and output must be zod schemas: ` +
    `export each schema as a zod variable from a file that does not import #pikku (a sibling <fn>.schemas.ts), ` +
    `reference it as \`input:\` / \`output:\` on the function, and drop the generics. ` +
    `TypeScript types would make the SDK import from the addon's src/, which the consumer does not have.`
  )
}
