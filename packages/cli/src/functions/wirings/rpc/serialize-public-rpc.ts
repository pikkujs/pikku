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
import { pikkuSessionlessFunc, defineHTTPRoutes, wireHTTPRoutes } from '${pathToPikkuTypes}'

export const rpcCaller = pikkuSessionlessFunc<
  { rpcName: string; data?: unknown },
  unknown
>({
  auth: ${authFlag},
  func: async (_services, { rpcName, data }, { rpc }) => {
    return await rpc.exposed(rpcName, data)
  },
})

export const workflowCaller = pikkuSessionlessFunc<
  { workflowName: string; input?: unknown },
  { runId: string }
>({
  auth: ${authFlag},
  func: async (_services, { workflowName, input }, { rpc }) => {
    return await rpc.startWorkflow(workflowName, input || {})
  },
})

export const rpcRoutes = defineHTTPRoutes({
  auth: ${authFlag},
  tags: ['pikku:public'],
  routes: {
    rpcOptions: {
      route: '/rpc/:rpcName',
      method: 'options',
      func: pikkuSessionlessFunc<{ rpcName: string }>(async () => void 0),
    },
    rpc: {
      route: '/rpc/:rpcName',
      method: 'post',
      func: rpcCaller,
    },
    workflowOptions: {
      route: '/rpc/workflow/:workflowName',
      method: 'options',
      func: pikkuSessionlessFunc<{ workflowName: string }>(async () => void 0),
    },
    workflow: {
      route: '/rpc/workflow/:workflowName',
      method: 'post',
      func: workflowCaller,
    },
  },
})

wireHTTPRoutes({ routes: { rpc: rpcRoutes } })
`
}
