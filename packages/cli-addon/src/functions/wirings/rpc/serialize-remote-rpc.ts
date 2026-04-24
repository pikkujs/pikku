/**
 * Generate remote internal RPC queue worker and HTTP endpoint
 */
export const serializeRemoteRPC = (pathToPikkuTypes: string) => {
  return `/**
 * Auto-generated remote internal RPC queue worker and HTTP endpoint
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireHTTP } from '${pathToPikkuTypes}'
import { pikkuRemoteAuthMiddleware } from '@pikku/core/middleware'

export const remoteRPCHandler = pikkuSessionlessFunc<
  { rpcName: string, data?: unknown },
  unknown
>({
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await (rpc.invoke as any)(rpcName, data)
  },
  remote: true,
})

wireHTTP({
  route: '/remote/rpc/:rpcName',
  method: 'post',
  auth: false,
  middleware: [pikkuRemoteAuthMiddleware],
  func: remoteRPCHandler,
})
`
}
