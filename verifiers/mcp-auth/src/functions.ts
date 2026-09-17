import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'

/**
 * The three ways an MCP tool can stand on the auth question, one tool each.
 * A client meets all three on the same endpoint, which is the point: the
 * challenge has to follow the declaration rather than the endpoint.
 */

/** Open: a sessionless function saying nothing about auth. */
export const searchCatalog = pikkuSessionlessFunc<void, string>({
  mcp: true,
  func: async () => 'catalog',
})

/** Gated by its own declaration, despite being sessionless. */
export const myOrders = pikkuSessionlessFunc<void, string>({
  mcp: true,
  auth: true,
  func: async () => 'orders',
})

/** Gated by being a `pikkuFunc` at all — a session is the baseline. */
export const placeOrder = pikkuFunc<void, string>({
  mcp: true,
  func: async () => 'placed',
})
