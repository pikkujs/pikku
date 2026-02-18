/**
 * Generate public RPC HTTP endpoint
 */
export const serializePublicRPC = (
  pathToPikkuTypes: string,
  requireAuth: boolean = true
) => {
  const authFlag = requireAuth ? 'true' : 'false'
  return `/**
 * Auto-generated public RPC HTTP endpoint
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc, wireHTTP } from '${pathToPikkuTypes}'

/**
 * Public RPC endpoint that invokes any exposed RPC by name
 * This is used for public HTTP access to exposed server functions
 */
export const rpcCaller = pikkuSessionlessFunc<
  { rpcName: string; data?: unknown },
  unknown
>({
  auth: ${authFlag},
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await rpc.exposed(rpcName, data)
  },
})

wireHTTP({
  route: "/rpc/:rpcName",
  method: "options",
  tags: ['pikku:public'],
  auth: ${authFlag},
  func: pikkuSessionlessFunc<{ rpcName: string }>(async () => void 0),
});

wireHTTP({
  route: '/rpc/:rpcName',
  method: 'post',
  tags: ['pikku:public'],
  auth: ${authFlag},
  func: rpcCaller,
})
`
}
