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
    rpc: {
      route: '/rpc/:rpcName',
      method: 'post',
      func: rpcCaller,
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
