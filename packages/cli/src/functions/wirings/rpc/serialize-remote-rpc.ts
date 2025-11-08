/**
 * Generate remote internal RPC queue worker
 */
export const serializeRemoteRPC = (pathToPikkuTypes: string) => {
  return `/**
 * Auto-generated remote internal RPC queue worker
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireQueueWorker } from '${pathToPikkuTypes}'

/**
 * Generic remote RPC worker that invokes any RPC by name
 * This is used for executing RPCs via a queue (e.g., scheduled tasks, background jobs, or remote internal HTTP calls)
 */
export const pikkuRemoteInternalRPC = pikkuSessionlessFunc<
  { rpcName: string, data?: any },
  void
>({
  func: async ({ rpc }, { rpcName, data }) => {
    await (rpc.invoke as any)(rpcName, data)
  },
  internal: true,
})

wireQueueWorker({
  queueName: 'pikku-remote-internal-rpc',
  func: pikkuRemoteInternalRPC,
})
`
}
