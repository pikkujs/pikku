/**
 * Generate public RPC HTTP endpoint
 */
export const serializePublicRPC = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true,
  globalHTTPPrefix: string = ''
) => {
  const authFlag = requireAuth ? 'true' : 'false'
  return `/**
 * Auto-generated public RPC HTTP endpoint
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireHTTP } from '${pathToPikkuTypes}'

const rpcCaller = pikkuSessionlessFunc<
  { rpcName: string; data?: unknown },
  unknown
>({
  auth: ${authFlag},
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await rpc.exposed(rpcName, data)
  },
})

wireHTTP({
  route: '${globalHTTPPrefix}/rpc/:rpcName',
  method: 'post',
  auth: ${authFlag},
  func: rpcCaller,
})
`
}
