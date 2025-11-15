import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * @summary Recursive RPC invocation test
 * @description Tests recursive RPC calls up to depth of 10, incrementing input value on each invocation
 */
export const rpcTest = pikkuSessionlessFunc<{ in: number }>({
  func: async ({ logger, rpc }, data) => {
    logger.debug(`RPC Test with RPC: ${rpc?.depth}`)
    if (rpc?.depth && rpc?.depth < 10) {
      data.in += 1
      rpc.invoke('rpcTest', data)
    }
    return data
  },
  expose: true,
})
