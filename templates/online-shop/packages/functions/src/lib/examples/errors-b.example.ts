import { z } from 'zod'
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'
import { wireHTTPRoutes } from '#pikku/http'
import { wireAddon } from '#pikku/addon'
import { isOrderOwner } from '../../wirings/shop.security.js'
import { getItem } from '../../functions/items/get-item.function.js'
import { getOrder } from '../../functions/orders/get-order.function.js'

// @snippet start eb-exported-pikku-func
// Wrapped in pikkuFunc and exported: the two things the inspector looks for.
export const greet = pikkuFunc({
  input: z.object({ name: z.string() }),
  func: async (_services, { name }) => ({ message: `Hello ${name}` }),
})
// @snippet end eb-exported-pikku-func

// @snippet start eb-public-and-private-routes
// Public routes grouped apart from the ones that need a session.
export function wireShopRoutes() {
  wireHTTPRoutes({
    auth: false,
    routes: {
      getItem: { method: 'get', route: '/items/:itemId', func: getItem },
    },
  })
  wireHTTPRoutes({
    routes: {
      getOrder: { method: 'get', route: '/orders/:orderId', func: getOrder },
    },
  })
}
// @snippet end eb-public-and-private-routes

// @snippet start eb-exposed-requires-session
export const listInvoices = pikkuFunc({
  expose: true,
  auth: true, // a session is required
  func: async ({ kysely }) => {
    return kysely.selectFrom('order').selectAll().execute()
  },
})
// @snippet end eb-exposed-requires-session

// @snippet start eb-exposed-with-permission
export const exportOrder = pikkuFunc({
  expose: true,
  auth: true,
  permissions: { owner: isOrderOwner },
  input: z.object({ orderId: z.string() }),
  func: async ({ kysely }, { orderId }) => {
    return kysely
      .selectFrom('order')
      .selectAll()
      .where('orderId', '=', orderId)
      .executeTakeFirst()
  },
})
// @snippet end eb-exposed-with-permission

// @snippet start eb-exposed-public-on-purpose
export const getPublicCatalogue = pikkuSessionlessFunc({
  expose: true,
  auth: false, // public on purpose
  readonly: true,
  func: async ({ kysely }) => {
    return kysely.selectFrom('item').select(['itemId', 'name']).execute()
  },
})
// @snippet end eb-exposed-public-on-purpose

// @snippet start eb-addon-gate
export function wireGatedAddon() {
  wireAddon({ name: 'admin', package: '@acme/addon-admin', auth: true })
}
// @snippet end eb-addon-gate

// @snippet start eb-internal-only-func
export const countOrders = pikkuFunc({
  // no `expose` — internal RPC only
  func: async ({ kysely }) => {
    return kysely.selectFrom('order').selectAll().execute()
  },
})
// @snippet end eb-internal-only-func

// @snippet start eb-safe-projection
// Select only the columns that are safe to return.
export const getPublicUser = pikkuSessionlessFunc({
  input: z.object({ userId: z.string() }),
  func: async ({ kysely }, { userId }) => {
    return kysely
      .selectFrom('user')
      .select(['id', 'name'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow()
  },
})
// @snippet end eb-safe-projection

// @snippet start eb-log-id-not-person
export const notifyUser = pikkuFunc({
  input: z.object({ userId: z.string() }),
  func: async ({ logger, kysely }, { userId }) => {
    const user = await kysely
      .selectFrom('user')
      .select(['id', 'email'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow()
    logger.info(`notification sent to user ${user.id}`) // an id, not an address
  },
})
// @snippet end eb-log-id-not-person

// @snippet start eb-wire-graph-addon
export function wireGraphAddon() {
  wireAddon({ name: 'graph', package: '@pikku/addon-graph' })
}
// @snippet end eb-wire-graph-addon
