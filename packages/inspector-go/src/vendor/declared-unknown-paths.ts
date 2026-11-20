type ZodDef = { type?: string; [key: string]: any }

/**
 * The paths at which a Zod schema itself says `z.unknown()` or `z.any()`. A
 * path names properties with `.name`, array items with `[]` and open-map values
 * with `[*]`, the same notation the generated-schema check reads off the JSON
 * Schema. Every depth is walked; a schema met again while still being walked
 * (a recursive `z.lazy`) is not entered twice.
 */
export const declaredUnknownPathsOfZod = (zodSchema: unknown): Set<string> => {
  const found = new Set<string>()
  const walking = new Set<unknown>()

  const visit = (schema: any, path: string) => {
    const def: ZodDef | undefined = schema?._zod?.def
    if (!def || walking.has(schema)) return
    walking.add(schema)
    switch (def.type) {
      case 'unknown':
      case 'any':
        found.add(path || '$')
        break
      case 'object':
        for (const [name, child] of Object.entries(def.shape ?? {})) {
          visit(child, `${path}.${name}`)
        }
        if (def.catchall) visit(def.catchall, `${path}[*]`)
        break
      case 'array':
        visit(def.element, `${path}[]`)
        break
      case 'tuple':
        for (const item of def.items ?? []) visit(item, `${path}[]`)
        break
      case 'record':
      case 'map':
        visit(def.valueType, `${path}[*]`)
        break
      case 'union':
        for (const option of def.options ?? []) visit(option, path)
        break
      case 'intersection':
        visit(def.left, path)
        visit(def.right, path)
        break
      case 'pipe':
        visit(def.out, path)
        break
      case 'lazy':
        visit(def.getter?.(), path)
        break
      default:
        if (def.innerType) visit(def.innerType, path)
    }
    walking.delete(schema)
  }

  visit(zodSchema, '')
  return found
}
