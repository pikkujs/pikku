import { z } from 'zod'

/**
 * The shared route table. N routes of one shape with different handlers: `POST /api/items/r<i>` with body `{ id }`, guarded by
 * permission `p<i mod 4>`, answering `{ route, id, name, value }`. Every adapter builds its routes from this table.
 */
export const PERMISSION_COUNT = 4
export const itemInput = z.object({ id: z.number().int().min(1).max(1000) })
export const itemJsonSchema = z.toJSONSchema(itemInput, { io: 'input' })
export const ITEM_ROWS = 1000

export type RouteSpec = { index: number; path: string; permission: string }

export const routeTable = (n: number): RouteSpec[] =>
  Array.from({ length: n }, (_, index) => ({
    index,
    path: `/api/items/r${index}`,
    permission: `p${index % PERMISSION_COUNT}`,
  }))

/** The fixed request order, identical for every framework: route i, id derived from the position. Round-robin over all routes. */
export const requestPlan = (n: number, length = Math.max(n, 40)) =>
  Array.from({ length }, (_, position) => {
    const route = routeTable(n)[position % n]!
    return { path: route.path, body: { id: 1 + ((position * 37) % 1000) } }
  })
