import { pikkuSessionlessFunc } from '#pikku/function'

/** A route under the global limit. */
export const listItems = pikkuSessionlessFunc<void, { items: string[] }>({
  func: async () => ({ items: ['a', 'b'] }),
})

/** A route with its own, tighter limit, which replaces the global one. */
export const submitContact = pikkuSessionlessFunc<void, { received: true }>({
  rateLimit: { limit: 2, windowMs: 60_000 },
  func: async () => ({ received: true }),
})

/** A route exempt from every limit. */
export const health = pikkuSessionlessFunc<void, { ok: true }>({
  rateLimit: false,
  func: async () => ({ ok: true }),
})

/**
 * One external call that makes several internal ones. The internal calls reach
 * `listItems`, which is under the global limit, and none of them may count.
 */
export const fanOut = pikkuSessionlessFunc<void, { calls: number }>({
  func: async (_services, _data, { rpc }) => {
    for (let i = 0; i < 6; i++) await rpc.invoke('listItems', undefined)
    return { calls: 6 }
  },
})

/** An MCP tool under the global limit. */
export const searchCatalog = pikkuSessionlessFunc<void, string>({
  mcp: true,
  func: async () => 'catalog',
})

/** An MCP tool exempt from every limit. */
export const pingTool = pikkuSessionlessFunc<void, string>({
  mcp: true,
  rateLimit: false,
  func: async () => 'pong',
})
