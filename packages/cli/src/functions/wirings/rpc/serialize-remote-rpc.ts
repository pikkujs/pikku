/**
 * Generate remote internal RPC queue worker and HTTP endpoint
 */
export const serializeRemoteRPC = (pathToPikkuTypes: string) => {
  return `/**
 * Auto-generated remote internal RPC queue worker and HTTP endpoint
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireHTTP, wireQueueWorker } from '${pathToPikkuTypes}'

/**
 * Generic remote RPC worker that invokes any internal RPC by name
 * This is used for executing internal RPCs via a queue or HTTP (e.g., scheduled tasks, background jobs, internal services)
 *
 * TODO: Security risk - this allows any RPC to be invoked by name. Should validate
 * that rpcName is in an allowlist of permitted internal RPCs to prevent unauthorized access.
 */
export const pikkuRemoteInternalRPC = pikkuSessionlessFunc<
  { rpcName: string, data?: unknown },
  unknown
>({
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await (rpc.invoke as any)(rpcName, data)
  },
  remote: true,
})

wireQueueWorker({
  name: 'pikku-remote-internal-rpc',
  func: pikkuRemoteInternalRPC,
})

/**
 * HTTP endpoint for remote RPC calls from deployment services.
 * The pikkuRemoteAuthMiddleware validates the PIKKU_REMOTE_SECRET
 * JWT and restores the session on /remote/rpc/ paths.
 */
wireHTTP({
  route: '/remote/rpc/:rpcName',
  method: 'post',
  auth: false,
  func: pikkuRemoteInternalRPC,
})
`
}
