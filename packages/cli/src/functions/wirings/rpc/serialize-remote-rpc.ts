/**
 * Generate remote internal RPC queue worker
 */
export const serializeRemoteRPC = () => {
  return `/**
 * Auto-generated remote internal RPC queue worker
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireQueueWorker } from '../../.pikku/pikku-types.gen.js'

/**
 * Generic remote RPC worker that invokes any RPC by name
 * This is used for executing RPCs via a queue (e.g., scheduled tasks, background jobs)
 */
export const pikkuRemoteInternalRPC = pikkuSessionlessFunc<
  { rpcName: string, data?: any, session?: any },
  void
>({
  func: async ({ rpc }, { rpcName, data }) => {
    // Session is included in the payload for future support
    // Queue middleware can refresh/validate sessions before execution
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
