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
  { rpcName: string; data?: unknown },
  unknown
>({
  auth: false,
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await rpc.invokeExposed(rpcName, data)
  },
})

wireHTTP({
  route: "/rpc/:rpcName",
  method: "options",
  auth: false,
  func: pikkuSessionlessFunc<{ rpcName: string }>(async () => void 0),
});

wireHTTP({
  route: '/rpc/:rpcName',
  method: 'post',
  auth: false,
  func: rpcCaller,
})
`
}
