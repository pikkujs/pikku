const MAX_DEPTH = 12

type ZodDef = { type?: string; [key: string]: any }

/**
 * The paths at which a Zod schema itself says `z.unknown()` or `z.any()`. A
 * path names properties with `.name`, array items with `[]` and open-map values
 * with `[*]`, the same notation the generated-schema check reads off the JSON
 * Schema.
 */
export const declaredUnknownPathsOfZod = (zodSchema: unknown): Set<string> => {
  const found = new Set<string>()

  const visit = (schema: any, path: string, depth: number) => {
    const def: ZodDef | undefined = schema?._zod?.def
    if (!def || depth > MAX_DEPTH) return
    switch (def.type) {
      case 'unknown':
      case 'any':
        found.add(path || '$')
        return
      case 'object':
        for (const [name, child] of Object.entries(def.shape ?? {})) {
          visit(child, `${path}.${name}`, depth + 1)
        }
        return
      case 'array':
        visit(def.element, `${path}[]`, depth + 1)
        return
      case 'tuple':
        for (const item of def.items ?? []) visit(item, `${path}[]`, depth + 1)
        return
      case 'record':
      case 'map':
        visit(def.valueType, `${path}[*]`, depth + 1)
        return
      case 'union':
        for (const option of def.options ?? []) visit(option, path, depth + 1)
        return
      case 'intersection':
        visit(def.left, path, depth + 1)
        visit(def.right, path, depth + 1)
        return
      case 'pipe':
        visit(def.in, path, depth + 1)
        return
      case 'lazy':
        visit(def.getter?.(), path, depth + 1)
        return
      default:
        if (def.innerType) visit(def.innerType, path, depth + 1)
    }
  }

  visit(zodSchema, '', 0)
  return found
}
