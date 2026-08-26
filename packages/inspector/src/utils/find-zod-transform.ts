/**
 * Locate a `.transform()` anywhere inside a Zod schema.
 *
 * A transform is why a schema cannot be a function's `input`: the value the
 * caller sends and the value the function receives are different, and a wire
 * contract has to describe one shape. Zod says so twice, in two different
 * places, and neither says it usefully on its own — `toJSONSchema` with
 * `unrepresentable: 'any'` quietly yields `{}`, a schema that accepts
 * everything, and `zodToTs` throws about TypeScript rather than about the
 * wiring. Finding it up front lets the diagnostic name the schema, the path,
 * and the call.
 *
 * Zod 4 models `x.transform(fn)` as a `pipe` whose `out` is a `transform`, so
 * the walk looks for that node rather than for the method.
 */

/** Max nodes visited, so a pathological or cyclic schema cannot hang the walk. */
const MAX_NODES = 10_000

interface ZodNode {
  _zod?: { def?: Record<string, any> }
}

const isNode = (value: unknown): value is ZodNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ZodNode)._zod?.def?.type === 'string'

/**
 * The path to the first `.transform()` found — `''` when the transform is the
 * schema itself, `'.user.email'` when it is nested — or `undefined` when there
 * is none.
 */
export function findZodTransform(schema: unknown): string | undefined {
  const seen = new Set<unknown>()
  let budget = MAX_NODES

  const walk = (node: unknown, path: string): string | undefined => {
    if (budget-- <= 0 || !isNode(node) || seen.has(node)) return undefined
    seen.add(node)

    const def = node._zod!.def!
    if (def.type === 'transform') return path

    const children: Array<[unknown, string]> = []
    switch (def.type) {
      case 'object':
      case 'interface':
        for (const [key, child] of Object.entries(def.shape ?? {})) {
          children.push([child, `${path}.${key}`])
        }
        break
      case 'array':
      case 'set':
        children.push([def.element, `${path}[]`])
        break
      case 'tuple':
        for (const [i, child] of (def.items ?? []).entries()) {
          children.push([child, `${path}[${i}]`])
        }
        if (def.rest) children.push([def.rest, `${path}[]`])
        break
      case 'union':
        for (const [i, child] of (def.options ?? []).entries()) {
          children.push([child, `${path}|${i}`])
        }
        break
      case 'intersection':
        children.push([def.left, path], [def.right, path])
        break
      case 'record':
      case 'map':
        children.push(
          [def.keyType, `${path}[key]`],
          [def.valueType, `${path}[]`]
        )
        break
      case 'pipe':
        // `.transform()` itself: report the pipe's own path, not `out`'s.
        children.push([def.in, path], [def.out, path])
        break
      default:
        // optional, nullable, default, prefault, nonoptional, readonly, catch,
        // promise, lazy, success — every wrapper Zod spells `innerType`.
        if (def.innerType) children.push([def.innerType, path])
        if (def.getter) {
          try {
            children.push([def.getter(), path])
          } catch {
            // A lazy schema that cannot be forced tells us nothing; skip it.
          }
        }
    }

    for (const [child, childPath] of children) {
      const found = walk(child, childPath)
      if (found !== undefined) return found
    }
    return undefined
  }

  return walk(schema, '')
}
