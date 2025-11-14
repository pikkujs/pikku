/**
 * Public RPC HTTP Endpoint
 *
 * Note: The Pikku CLI has the capability to auto-generate this file via the
 * `pikkuPublicRPC` command, but that feature is currently disabled to focus
 * on other releases. For now, this file is included manually in templates.
 *
 * This endpoint allows exposed RPC functions to be called over HTTP.
 */
import {
  pikkuSessionlessFunc,
  pikkuVoidFunc,
  wireHTTP,
} from '../.pikku/pikku-types.gen.js'

/**
 * Public RPC endpoint that invokes any exposed RPC by name
 * This is used for public HTTP access to exposed server functions
 */
export const rpcCaller = pikkuSessionlessFunc<
  { name: string; data?: any },
  any
>({
  auth: false,
  func: async ({ rpc }, { name, data }) => {
    console.log('invoking rpc', name, data)
    return await (rpc.invokeExposed as any)(name, data)
  },
})

wireHTTP({
  route: '/rpc',
  method: 'options',
  auth: false,
  func: pikkuVoidFunc(async () => void 0),
})

wireHTTP({
  route: '/rpc',
  method: 'post',
  func: rpcCaller,
})
