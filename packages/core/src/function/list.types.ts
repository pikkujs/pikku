/**
 * List-function primitives.
 *
 * A "list function" is any Pikku function that returns a paginated
 * collection. Adopting this shape unlocks a shared vocabulary across
 * MCP tools, AI agents, typed RPC clients, and widget libraries — they
 * all reason about cursor, filter, sort, and search uniformly.
 *
 * Under the hood, a list function is still a normal `pikkuFunc`. These
 * types are purely structural constraints; no runtime behaviour change.
 *
 * @example
 * ```ts
 * import { pikkuFunc } from '#pikku'
 * import type { ListInput, ListOutput } from '@pikku/core'
 *
 * export const listSessions = pikkuFunc<
 *   ListInput<{ status?: SessionStatus[] }, 'user' | 'status' | 'uploaded_at'>,
 *   ListOutput<Session>
 * >({
 *   func: async ({ kysely }, input) => {
 *     // input.sort / input.filter / input.cursor / input.search are typed
 *     return { rows, nextCursor, totalCount }
 *   },
 * })
 * ```
 */

/**
 * Shape every list function accepts as input.
 *
 * @template F - User-defined filter shape. Each key is a filterable field.
 * @template S - String union of sortable column names.
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
  /** Structured filter tree. See {@link Filter}. */
  filter?: Filter<F>
  /** Unstructured text search across server-configured fields. */
  search?: string
}

/**
 * Shape every list function returns.
 */
export interface ListOutput<Row> {
  rows: Row[]
  /** Null when no more pages. */
  nextCursor: string | null
  /** Optional — backend may skip when expensive. */
  totalCount?: number
}

/**
 * Leaf predicate value on a single field.
 *
 * Operator keywords (`equals`, `not`, `in`, `notIn`, `gt`, `gte`, `lt`,
 * `lte`, `contains`, `startsWith`, `endsWith`, `mode`) mirror Prisma's
 * vocabulary for dev familiarity. These keys are reserved and cannot be
 * used as user field names in a Filter's `F` type.
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
 * A single-key object keyed by a field name from F, value is a leaf
 * predicate. Single-key so the runtime discriminator is unambiguous:
 * multi-key objects are OR groups.
 */
export type LeafFilter<F extends Record<string, unknown>> = {
  [K in keyof F]: { [Key in K]: LeafValue<F[K]> }
}[keyof F]

/**
 * Recursive filter tree.
 *
 * - `Array<Filter<F>>` — AND of children.
 * - `{ [label: string]: Filter<F> }` — OR of children. Keys are arbitrary
 *   labels (unique strings), ignored at evaluation time.
 * - `LeafFilter<F>` — single-key predicate on a declared field.
 *
 * @example "status = pending AND (therapist = kim OR therapist = park) AND uploaded_at > 2026-04-10"
 * ```ts
 * const filter: Filter<{ status: string; therapistId: string; uploadedAt: string }> = [
 *   { status: 'pending' },
 *   {
 *     kim:  { therapistId: 'kim' },
 *     park: { therapistId: 'park' },
 *   },
 *   { uploadedAt: { gt: '2026-04-10' } },
 * ]
 * ```
 */
export type Filter<F extends Record<string, unknown>> =
  | LeafFilter<F>
  | Filter<F>[]
  | { [label: string]: Filter<F> }
