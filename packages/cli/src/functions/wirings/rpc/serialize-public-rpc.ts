/**
 * Generate public RPC HTTP endpoint
 */
export const serializePublicRPC = (pathToPikkuTypes: string) => {
  return `/**
 * Auto-generated public RPC HTTP endpoint
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireHTTP } from '${pathToPikkuTypes}'

/**
 * Public RPC endpoint that invokes any exposed RPC by name
 * This is used for public HTTP access to exposed server functions
 */
export const rpcCaller = pikkuSessionlessFunc<
  { name: string, data?: any },
  any
>({
  func: async ({ rpc }, { name, data }) => {
    return await (rpc.invokeExposed as any)(name, data)
  },
})

wireHTTP({
  route: '/rpc',
  method: 'post',
  func: rpcCaller,
})
`
}
