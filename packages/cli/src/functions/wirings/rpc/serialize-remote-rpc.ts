/**
 * Generate remote internal RPC queue worker and HTTP endpoint
 */
export const serializeRemoteRPC = (pathToPikkuTypes: string) => {
  return `/**
 * Auto-generated remote internal RPC queue worker and HTTP endpoint
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireQueueWorker, wireHTTP } from '${pathToPikkuTypes}'

/**
 * Generic remote RPC worker that invokes any internal RPC by name
 * This is used for executing internal RPCs via a queue or HTTP (e.g., scheduled tasks, background jobs, internal services)
 */
export const pikkuRemoteInternalRPC = pikkuSessionlessFunc<
  { rpcName: string, data?: any },
  any
>({
  func: async ({ rpc }, { rpcName, data }) => {
    return await (rpc.invoke as any)(rpcName, data)
  },
  internal: true,
})

wireQueueWorker({
  queueName: 'pikku-remote-internal-rpc',
  func: pikkuRemoteInternalRPC,
})

wireHTTP({
  route: '/rpc/internal',
  method: 'post',
  func: pikkuRemoteInternalRPC,
})
`
}
