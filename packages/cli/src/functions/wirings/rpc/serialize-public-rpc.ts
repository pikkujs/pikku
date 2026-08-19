export interface PublicRPCGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate public RPC HTTP endpoint
 */
export const serializePublicRPC = (
  leaf: (name: string) => string,
  globalHTTPPrefix: string = ''
): PublicRPCGenOutput => {
  const schemas = `/**
 * Auto-generated public RPC endpoint schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

export const RPCCall = z.object({
  rpcName: z.string(),
  data: z.unknown().optional(),
})
`

  const functions = `/**
 * Auto-generated public RPC HTTP endpoint
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc } from '${leaf('function')}'
import { wireHTTP } from '${leaf('http')}'
import { RPCCall } from './rpc-public.schemas.gen.js'

export const rpcCaller = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: false,
  input: RPCCall,
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await rpc.exposed(rpcName, data)
  },
})

wireHTTP({
  route: '${globalHTTPPrefix}/rpc/:rpcName',
  method: 'post',
  auth: false,
  tags: ['pikku'],
  func: rpcCaller,
})
`

  return { schemas, functions }
}
