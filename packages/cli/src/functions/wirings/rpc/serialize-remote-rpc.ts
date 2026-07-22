export interface RemoteRPCGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate remote internal RPC queue worker and HTTP endpoint.
 *
 * Emitted as two files. The schema is zod, and the inspector reads a zod schema
 * by importing the module that declares it — which it cannot do for the wiring
 * file, whose relative pikku-types import per-unit deploy codegen rewrites.
 */
export const serializeRemoteRPC = (
  pathToPikkuTypes: string
): RemoteRPCGenOutput => {
  const schemas = `/**
 * Auto-generated remote internal RPC schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

/** A call to one named internal RPC on another unit. */
export const RemoteRPCCall = z.object({
  rpcName: z.string(),
  data: z.unknown().optional(),
})
`

  const functions = `/**
 * Auto-generated remote internal RPC queue worker and HTTP endpoint
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireHTTP, wireQueueWorker } from '${pathToPikkuTypes}'
import { pikkuRemoteAuthMiddleware } from '@pikku/core/middleware'
import { RemoteRPCCall } from './rpc-remote.schemas.gen.js'

export const remoteRPCHandler = pikkuSessionlessFunc({
  tags: ['pikku'],
  input: RemoteRPCCall,
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

  return { schemas, functions }
}
