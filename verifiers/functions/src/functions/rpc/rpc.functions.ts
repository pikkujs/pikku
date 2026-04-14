import { pikkuSessionlessFunc } from '#pikku'

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

export const listItems = pikkuSessionlessFunc<
  { limit: number; nextCursor?: string },
  { items: string[]; nextCursor?: string }
>({
  func: async (_services, data) => {
    return {
      items: [`item-${data.limit}`],
      nextCursor: data.nextCursor ? undefined : 'next',
    }
  },
  expose: true,
})
