/**
 * Generate remote internal RPC queue worker and HTTP endpoint.
 *
 * Two modes:
 *  - mesh (default): gated by `pikkuRemoteAuthMiddleware` (shared
 *    `PIKKU_REMOTE_SECRET`). Trusted machine-to-machine — may invoke any RPC.
 *  - public (`no-auth`): no mesh secret; a client authenticates however the
 *    functions' own tags/middleware require. Only `remote: true` functions are
 *    reachable (`assertRemoteInvocable`) so the endpoint is not an open gateway
 *    into every internal RPC. This is what a `wireRemoteAddon` consumer calls.
 */
export const serializeRemoteRPC = (
  pathToPikkuTypes: string,
  options: { noAuth?: boolean } = {}
) => {
  const { noAuth = false } = options

  if (noAuth) {
    return `/**
 * Auto-generated remote internal RPC queue worker and HTTP endpoint (public)
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireHTTP, wireQueueWorker } from '${pathToPikkuTypes}'
import { assertRemoteInvocable } from '@pikku/core/rpc'

export const remoteRPCHandler = pikkuSessionlessFunc<
  { rpcName: string, data?: unknown },
  unknown
>({
  tags: ['pikku'],
  func: async (_services, { rpcName, data }, { rpc }) => {
    // Public surface: only functions marked \`remote: true\` are reachable.
    assertRemoteInvocable(rpcName)
    return await (rpc.invoke as any)(rpcName, data)
  },
  remote: true,
})

wireQueueWorker({
  name: 'pikku-remote-internal-rpc',
  tags: ['pikku'],
  func: remoteRPCHandler,
})

wireHTTP({
  route: '/remote/rpc/:rpcName',
  method: 'post',
  auth: false,
  tags: ['pikku'],
  func: remoteRPCHandler,
})
`
  }

  return `/**
 * Auto-generated remote internal RPC queue worker and HTTP endpoint
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireHTTP, wireQueueWorker } from '${pathToPikkuTypes}'
import { pikkuRemoteAuthMiddleware } from '@pikku/core/middleware'

export const remoteRPCHandler = pikkuSessionlessFunc<
  { rpcName: string, data?: unknown },
  unknown
>({
  tags: ['pikku'],
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await (rpc.invoke as any)(rpcName, data)
  },
  remote: true,
})

wireQueueWorker({
  name: 'pikku-remote-internal-rpc',
  tags: ['pikku'],
  func: remoteRPCHandler,
})

wireHTTP({
  route: '/remote/rpc/:rpcName',
  method: 'post',
  auth: false,
  tags: ['pikku'],
  middleware: [pikkuRemoteAuthMiddleware],
  func: remoteRPCHandler,
})
`
}
