import { pikkuListFunc, pikkuSessionlessFunc } from '#pikku'

export const rpcTest = pikkuSessionlessFunc<{ in: number }>({
  func: async ({ logger }, data, { rpc }) => {
    logger.debug(`RPC Test with RPC: ${rpc?.depth}`)
    if (rpc?.depth && rpc?.depth < 10) {
      data.in += 1
      rpc.invoke('rpcTest', data)
    }
    return data
  },
  expose: true,
})

export const listItems = pikkuListFunc<
  { category?: string },
  { id: string; label: string }
>({
  func: async (_services, data) => {
    return {
      rows: [{ id: `item-${data.limit ?? 1}`, label: 'item' }],
      nextCursor: data.cursor ? null : 'next',
    }
  },
  expose: true,
})
