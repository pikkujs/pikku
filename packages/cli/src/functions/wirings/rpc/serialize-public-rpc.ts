export interface PublicRPCGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate public RPC HTTP endpoint
 */
export const serializePublicRPC = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true,
  globalHTTPPrefix: string = ''
): PublicRPCGenOutput => {
  const authFlag = requireAuth ? 'true' : 'false'

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
import { pikkuSessionlessFunc, wireHTTP } from '${pathToPikkuTypes}'
import { RPCCall } from './rpc-public.schemas.gen.js'

export const rpcCaller = pikkuSessionlessFunc({
  tags: ['pikku'],
  auth: ${authFlag},
  input: RPCCall,
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await rpc.exposed(rpcName, data)
  },
})

wireHTTP({
  route: '${globalHTTPPrefix}/rpc/:rpcName',
  method: 'post',
  auth: ${authFlag},
  tags: ['pikku'],
  func: rpcCaller,
})
`

  return { schemas, functions }
}
