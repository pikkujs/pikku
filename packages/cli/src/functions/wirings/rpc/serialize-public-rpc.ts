export interface PublicRPCGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate public RPC HTTP endpoint.
 *
 * Emitted as two files. The schema is zod, and the inspector reads a zod schema
 * by importing the module that declares it — which it cannot do for the wiring
 * file, whose relative pikku-types import per-unit deploy codegen rewrites.
 *
 * The result is deliberately unschema'd: the caller names the RPC at runtime, so
 * the response is whatever that RPC returns and nothing can describe it up
 * front. Leaving `output` off lets the inspector take it from the handler's own
 * return type instead of pinning it to a lie.
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

/** A call to one named RPC. \`data\` is that RPC's own input, validated by it. */
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
