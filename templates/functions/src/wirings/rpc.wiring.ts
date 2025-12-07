/**
 * Public RPC HTTP Endpoint
 *
 * Note: The Pikku CLI has the capability to auto-generate this file via the
 * `pikkuPublicRPC` command, but that feature is currently disabled to focus
 * on other releases. For now, this file is included manually in templates.
 *
 * This endpoint allows exposed RPC functions to be called over HTTP.
 */
import { pikkuSessionlessFunc, wireHTTP } from '#pikku/pikku-types.gen.js'

/**
 * Public RPC endpoint that invokes any exposed RPC by name
 * This is used for public HTTP access to exposed server functions
 */
export const rpcCaller = pikkuSessionlessFunc<
  { rpcName: string; data?: unknown },
  unknown
>({
  auth: false,
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await (
      rpc.invokeExposed as (name: string, data: unknown) => Promise<unknown>
    )(rpcName, data)
  },
})

wireHTTP({
  route: '/rpc/:rpcName',
  method: 'options',
  auth: false,
  func: pikkuSessionlessFunc<{ rpcName: string }>(async () => void 0),
})

wireHTTP({
  route: '/rpc/:rpcName',
  method: 'post',
  auth: false,
  func: rpcCaller,
})
