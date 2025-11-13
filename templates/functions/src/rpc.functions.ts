import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export const rpcTest = pikkuSessionlessFunc<{ in: number }>({
  func: async ({ logger }, { rpc }, data) => {
    logger.debug(`RPC Test with RPC: ${rpc?.depth}`)
    if (rpc?.depth && rpc?.depth < 10) {
      data.in += 1
      rpc.invoke('rpcTest', data)
    }
    return data
  },
  expose: true,
})
