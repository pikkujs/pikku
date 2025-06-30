import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export const rpcTest = pikkuSessionlessFunc<{ in: number }>(
  async ({ logger, rpc }, data) => {
    logger.debug(`RPC Test with RPC: ${rpc?.depth}`)
    if (rpc?.depth && rpc?.depth < 10) {
      data.in += 1
      rpc.invoke('rpcTest', data)
      await rpc?.invoke(`rpcTest`, data)
    }
    return data
  }
)

export const rpcCaller = pikkuSessionlessFunc(async ({ rpc, logger }) => {
  logger.info(`RPC Caller with RPC: ${rpc?.depth}`)
  return await rpc?.invoke(`rpcTest`, { in: 0 })
})
