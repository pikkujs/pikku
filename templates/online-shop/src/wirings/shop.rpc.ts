import { pikkuSessionlessFunc } from '#pikku/function'

// @snippet start rpcFunc
// Any pikkuSessionlessFunc is automatically available for internal RPC calls.
// Add expose: true to also make it reachable via the external RPC endpoint.
export const checkItemAvailability = pikkuSessionlessFunc({
  expose: true,
  description:
    'Check whether an item is in stock and return available quantity.',
  func: async ({ kysely }, { itemId }: { itemId: string }) => {
    const item = await kysely
      .selectFrom('item')
      .select(['stock', 'name', 'isActive'])
      .where('itemId', '=', itemId)
      .executeTakeFirst()

    if (!item) throw new Error(`Item not found: ${itemId}`)
    return {
      available: item.stock > 0 && item.isActive === 1,
      stock: item.stock,
      name: item.name,
    }
  },
})
// @snippet end rpcFunc
