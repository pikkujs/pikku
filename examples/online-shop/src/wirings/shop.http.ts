import { defineHTTPRoutes, wireHTTP, wireHTTPRoutes } from '#pikku/http'
import { addHTTPMiddleware } from '#pikku/middleware'
import { startExport } from './shop.queue.js'
import { conditionalReport } from './shop.cron.js'
import { listCategories } from '../functions/categories/list-categories.function.js'
import { createCategory } from '../functions/categories/create-category.function.js'
import { listItems } from '../functions/items/list-items.function.js'
import { getItem } from '../functions/items/get-item.function.js'
import { createItem } from '../functions/items/create-item.function.js'
import { updateItem } from '../functions/items/update-item.function.js'
import { getProfile } from '../functions/get-profile.function.js'
import { getBasket } from '../functions/basket/get-basket.function.js'
import { addToBasket } from '../functions/basket/add-to-basket.function.js'
import { removeFromBasket } from '../functions/basket/remove-from-basket.function.js'
import { createOrder } from '../functions/orders/create-order.function.js'
import { getOrder } from '../functions/orders/get-order.function.js'
import { listOrders } from '../functions/orders/list-orders.function.js'
import { cancelOrder } from '../functions/orders/cancel-order.function.js'

// @snippet start shopRoutes
// @snippet start wireHttp
export const shopRoutes = defineHTTPRoutes({
  auth: false,
  routes: {
    // Categories
    listCategories: {
      method: 'get',
      route: '/categories',
      func: listCategories,
    },
    createCategory: {
      method: 'post',
      route: '/categories',
      func: createCategory,
      auth: true,
    },

    // Items
    listItems: { method: 'get', route: '/items', func: listItems },
    getItem: { method: 'get', route: '/items/:itemId', func: getItem },
    createItem: {
      method: 'post',
      route: '/items',
      func: createItem,
      auth: true,
    },
    updateItem: {
      method: 'patch',
      route: '/items/:itemId',
      func: updateItem,
      auth: true,
    },

    // Account
    getProfile: {
      method: 'get',
      route: '/profile',
      func: getProfile,
      auth: true,
    },

    // Basket (sessionless — works for guests too)
    getBasket: { method: 'get', route: '/basket', func: getBasket },
    addToBasket: { method: 'post', route: '/basket/items', func: addToBasket },
    removeFromBasket: {
      method: 'delete',
      route: '/basket/items/:itemId',
      func: removeFromBasket,
    },

    // Orders (require auth)
    createOrder: {
      method: 'post',
      route: '/orders',
      func: createOrder,
      auth: true,
    },
    listOrders: {
      method: 'get',
      route: '/orders',
      func: listOrders,
      auth: true,
    },
    getOrder: {
      method: 'get',
      route: '/orders/:orderId',
      func: getOrder,
      auth: true,
    },
    cancelOrder: {
      method: 'post',
      route: '/orders/:orderId/cancel',
      func: cancelOrder,
      auth: true,
    },
  },
})
// @snippet end wireHttp
// @snippet end shopRoutes

// @snippet start httpRoutesWiring
wireHTTPRoutes({ routes: { shop: shopRoutes } })
// @snippet end httpRoutesWiring

// @snippet start httpSingleRoute
// Wire a single route — good for one-offs
wireHTTP({
  method: 'get',
  route: '/items/:itemId',
  func: getItem,
  auth: false,
})
// @snippet end httpSingleRoute

// @snippet start httpAuthRoute
// Public route — no auth required
wireHTTP({ method: 'get', route: '/items', func: listItems, auth: false })

// Protected route — requires a user session
wireHTTP({ method: 'post', route: '/orders', func: createOrder, auth: true })
// @snippet end httpAuthRoute

// @snippet start httpMiddleware
// Global middleware — applies to every HTTP route
addHTTPMiddleware('*', [
  async ({ logger }, data, next) => {
    const start = Date.now()
    await next()
    logger.info({ path: data.http?.request?.path(), ms: Date.now() - start })
  },
])

// Prefix middleware — applies only to /orders/*
addHTTPMiddleware('/orders', [
  async (_services, _data, next) => {
    // e.g. rate-limit order creation
    await next()
  },
])
// @snippet end httpMiddleware

// @snippet start funcMultiWire
// The same function can be wired to multiple transports without any changes.
// Define once, wire everywhere.
wireHTTP({ method: 'get', route: '/items/:itemId', func: getItem, auth: false })
// @snippet end funcMultiWire

wireHTTP({ method: 'post', route: '/exports', func: startExport, auth: true })
wireHTTP({
  method: 'post',
  route: '/reports/conditional',
  func: conditionalReport,
  auth: true,
})
