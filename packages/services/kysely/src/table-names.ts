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
