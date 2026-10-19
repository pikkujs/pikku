export interface MeshRPCGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate mesh RPC queue worker and HTTP endpoint
 */
export const serializeMeshRPC = (
  leaf: (name: string) => string
): MeshRPCGenOutput => {
  const schemas = `/**
 * Auto-generated mesh RPC schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

export const MeshRPCCall = z.object({
  rpcName: z.string(),
  data: z.unknown().optional(),
})
`

  const functions = `/**
 * Auto-generated mesh RPC queue worker and HTTP endpoint
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc } from '${leaf('function')}'
import { wireHTTP } from '${leaf('http')}'
import { wireQueueWorker } from '${leaf('queue')}'
import { pikkuMeshAuthMiddleware } from '@pikku/core/middleware'
import { MeshRPCCall } from './rpc-mesh.schemas.gen.js'

export const meshRPCHandler = pikkuSessionlessFunc({
  tags: ['pikku'],
  input: MeshRPCCall,
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await (rpc.invoke as any)(rpcName, data)
  },
  remote: true,
})

wireQueueWorker({
  name: 'pikku-mesh-rpc',
  tags: ['pikku'],
  func: meshRPCHandler,
})

wireHTTP({
  route: '/mesh/rpc/:rpcName',
  method: 'post',
  auth: false,
  tags: ['pikku'],
  middleware: [pikkuMeshAuthMiddleware],
  func: meshRPCHandler,
})
`

  return { schemas, functions }
}
