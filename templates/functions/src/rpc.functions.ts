import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * Recursive RPC test function
 *
 * @summary Demonstrates RPC invocation with recursive calls up to depth 10
 * @description This function showcases Pikku's RPC (Remote Procedure Call) capabilities by
 * recursively calling itself up to 10 times. It increments the input value and tracks the
 * call depth. The `expose: true` flag makes this function available for RPC invocation from
 * other functions, workflows, or services. Useful for testing RPC infrastructure and
 * understanding call stack behavior.
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
