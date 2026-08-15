/**
 * A list function is an ordinary `pikkuFunc` whose input and output adopt
 * these shapes. They are purely structural — no runtime behaviour attaches to
 * them — and exist so MCP tools, agents, RPC clients and widget libraries all
 * reason about cursor, filter, sort and search the same way.
 */

export interface ListInput<
  F extends Record<string, unknown> = Record<string, never>,
  S extends string = never,
> {
  /** Opaque cursor from the previous page's `nextCursor`. */
  cursor?: string
  /** Page size. Server may cap. */
  limit?: number
  /** Ordered sort criteria — first entry is primary. */
  sort?: Array<{ column: S; direction: 'asc' | 'desc' }>
  filter?: Filter<F>
  /** Unstructured text search across server-configured fields. */
  search?: string
}

export interface ListOutput<Row> {
  rows: Row[]
  /** Null when no more pages. */
  nextCursor: string | null
  /** Optional — backend may skip when expensive. */
  totalCount?: number
}

/**
 * Leaf predicate on a single field. The operator keywords mirror Prisma's
 * vocabulary; they are reserved and cannot be used as user field names in a
 * Filter's `F` type.
 */
export type LeafValue<T> =
  | T
  | null
  | T[]
  | {
      equals?: T | null
      not?: T | null | LeafValue<T>
      in?: T[]
      notIn?: T[]
      gt?: T
      gte?: T
      lt?: T
      lte?: T
      contains?: string
      startsWith?: string
      endsWith?: string
      mode?: 'sensitive' | 'insensitive'
    }

/**
 * A single-key object keyed by a field of F. Single-key so the runtime
 * discriminator is unambiguous — multi-key objects are OR groups.
 */
export type LeafFilter<F extends Record<string, unknown>> = {
  [K in keyof F]: { [Key in K]: LeafValue<F[K]> }
}[keyof F]

/**
 * Recursive filter tree: an array is an AND of its children; an object is an
 * OR of its children, keyed by arbitrary unique labels that are ignored at
 * evaluation time; a single-key object is a leaf predicate.
 */
export type Filter<F extends Record<string, unknown>> =
  LeafFilter<F> | Filter<F>[] | { [label: string]: Filter<F> }
