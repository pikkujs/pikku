/**
 * Consumes the registry verifier addon — installed from the npm-pack artifact,
 * not the workspace source — and calls its `hello` function over RPC through
 * the `ext:` namespace that `wireAddon` sets up.
 */
import { pikkuSessionlessFunc } from '#pikku/function'
import { wireAddon } from '#pikku/addon'
import { wireHTTP } from '#pikku/http'

wireAddon({ name: 'ext', package: '@pikku/verifier-registry-addon' })

export type ConsumeHelloInput = { name: string; greeting?: string }
export type ConsumeHelloOutput = {
  message: string
  timestamp: number
  noopCalls: number
}

export const consumeHello = pikkuSessionlessFunc<
  ConsumeHelloInput,
  ConsumeHelloOutput
>({
  func: async (_, data, { rpc }) => {
    return await rpc.invoke('ext:hello', data)
  },
})

// Wire to HTTP so codegen registers the function (name + meta), which lets the
// runtime verifier invoke it and exercise the real `ext:hello` namespace path.
wireHTTP({
  route: '/consume-hello',
  method: 'post',
  auth: false,
  func: consumeHello,
})

export type ConsumeDeployOutput = {
  status: string
  output: unknown
  children: Array<{ workflow: string; status: string }>
}

/**
 * Starts the addon's `deployWorkflow`, which starts the addon's own
 * `waitForBuildHost` by its bare name, and reports both runs.
 */
export const consumeDeploy = pikkuSessionlessFunc<
  { host: string },
  ConsumeDeployOutput
>({
  func: async ({ workflowService }, data, { rpc }) => {
    const { runId } = await rpc.startWorkflow('ext:deployWorkflow', data)
    const run = await workflowService!.getRun(runId)
    const children = []
    for (const step of await workflowService!.getRunHistory(runId)) {
      if (!step.childRunId) continue
      const child = await workflowService!.getRun(step.childRunId)
      children.push({ workflow: child!.workflow, status: child!.status })
    }
    return { status: run!.status, output: run!.output, children }
  },
})

wireHTTP({
  route: '/consume-deploy',
  method: 'post',
  auth: false,
  func: consumeDeploy,
})
