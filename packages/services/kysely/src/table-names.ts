/**
 * Node kinds whose payload is caller data, never query structure. A table
 * name cannot be inside one, so the walk does not enter them: that keeps it
 * from reading a parameter value (a big array, a Buffer) and from being
 * fooled by a value shaped like a `TableNode`.
 */
const VALUE_KINDS = new Set(['ValueNode', 'PrimitiveValueListNode'])

/**
 * Adds to `out` the name of every table a Kysely operation node reads or
 * writes, in the order the walk meets them (so the first one is the main
 * table of a select, insert, update or delete).
 */
export function collectTableNames(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return

  const candidate = node as {
    kind?: string
    table?: { identifier?: { name?: string } }
  }

  if (candidate.kind !== undefined && VALUE_KINDS.has(candidate.kind)) return

  if (
    candidate.kind === 'TableNode' &&
    typeof candidate.table?.identifier?.name === 'string'
  ) {
    out.add(candidate.table.identifier.name)
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) collectTableNames(item, out)
      continue
    }
    collectTableNames(value, out)
  }
}

/** Nodes whose compiled text can hold caller-supplied literal text. */
const INLINE_KINDS = new Set(['RawNode', 'JSONPathNode', 'JSONPathLegNode'])

/**
 * True when the node tree can put caller text into the compiled SQL itself
 * rather than as a parameter: raw SQL, an immediate value (`sql.lit`), a JSON
 * path. Parameter values are not entered. Errs towards true.
 */
export function hasInlineSql(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const candidate = node as { kind?: string; immediate?: unknown }
  if (candidate.kind !== undefined) {
    if (INLINE_KINDS.has(candidate.kind)) return true
    if (candidate.kind === 'ValueNode') return candidate.immediate === true
    if (candidate.kind === 'PrimitiveValueListNode') return false
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      if (value.some(hasInlineSql)) return true
    } else if (hasInlineSql(value)) return true
  }
  return false
}
