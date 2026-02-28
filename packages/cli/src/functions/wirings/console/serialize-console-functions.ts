export const serializeConsoleFunctions = (pathToPikkuTypes: string) => {
  return `import { pikkuSessionlessFunc, defineHTTPRoutes, wireHTTPRoutes, addon, wireAddon } from '${pathToPikkuTypes}'

export const streamAgentRun = pikkuSessionlessFunc<
  { agentName: string } & Record<string, unknown>,
  any
>({
  title: 'Stream Agent Run',
  description: 'SSE stream of agent conversation responses.',
  expose: false,
  auth: false,
  func: async (_services, data, { rpc }) => {
    const { agentName, ...rest } = data
    await rpc.agent.stream(agentName as any, { ...rest, resourceId: (rest.resourceId as string) || 'console-playground' })
  },
})

export const resumeAgentRun = pikkuSessionlessFunc<
  {
    agentName: string
    runId: string
    toolCallId: string
    approved: boolean
  },
  any
>({
  title: 'Resume Agent Run',
  description: 'Resume an agent run after tool approval/denial.',
  expose: false,
  auth: false,
  func: async (_services, data, { rpc }) => {
    await rpc.agent.resume(data.runId, { toolCallId: data.toolCallId, approved: data.approved })
  },
})

export interface SetSecretInput {
  secretId: string
  value: unknown
}

export interface SetSecretOutput {
  success: boolean
}

export const setSecret = pikkuSessionlessFunc<SetSecretInput, SetSecretOutput>({
  description: 'Set the value of a secret',
  expose: true,
  auth: false,
  func: async ({ secrets }, { secretId, value }) => {
    await secrets.setSecretJSON(secretId, value)
    return { success: true }
  },
})

export interface GetVariableInput {
  variableId: string
}

export interface GetVariableOutput {
  exists: boolean
  value: unknown | null
}

export const getVariable = pikkuSessionlessFunc<
  GetVariableInput,
  GetVariableOutput
>({
  description: 'Get the current value of a variable',
  expose: true,
  auth: false,
  func: async ({ variables }, { variableId }) => {
    const exists = await variables.has(variableId)
    if (!exists) {
      return { exists: false, value: null }
    }
    try {
      const value = await variables.getJSON(variableId)
      return { exists: true, value }
    } catch {
      const value = await variables.get(variableId)
      return { exists: true, value }
    }
  },
})

export interface SetVariableInput {
  variableId: string
  value: unknown
}

export interface SetVariableOutput {
  success: boolean
}

export const setVariable = pikkuSessionlessFunc<
  SetVariableInput,
  SetVariableOutput
>({
  description: 'Set the value of a variable',
  expose: true,
  auth: false,
  func: async ({ variables }, { variableId, value }) => {
    if (typeof value === 'string') {
      await variables.set(variableId, value)
    } else {
      await variables.setJSON(variableId, value)
    }
    return { success: true }
  },
})

export interface GetSecretInput {
  secretId: string
}

export interface GetSecretOutput {
  exists: boolean
  value: unknown | null
}

export const getSecret = pikkuSessionlessFunc<
  GetSecretInput,
  GetSecretOutput
>({
  description: 'Get the current value of a secret',
  expose: true,
  auth: false,
  func: async ({ secrets }, { secretId }) => {
    const exists = await secrets.hasSecret(secretId)
    if (!exists) {
      return { exists: false, value: null }
    }
    const value = await secrets.getSecretJSON(secretId)
    return { exists: true, value }
  },
})

export interface StartWorkflowRunInput {
  workflowName: string
  input?: any
}

export interface StartWorkflowRunOutput {
  runId: string
}

export const startWorkflowRun = pikkuSessionlessFunc<
  StartWorkflowRunInput,
  StartWorkflowRunOutput
>({
  title: 'Start Workflow Run',
  description: 'Starts a new workflow run by name with optional input.',
  expose: true,
  auth: false,
  func: async (_services, { workflowName, input }, { rpc }) => {
    return await (rpc as any).startWorkflow(workflowName, input || {})
  },
})

export const consoleRoutes = defineHTTPRoutes({
  auth: false,
  routes: {
    agentStreamOptions: {
      route: '/api/agents/:agentName/stream',
      method: 'options',
      func: pikkuSessionlessFunc<{ agentName: string }>(async () => void 0),
    },
    agentStream: {
      route: '/api/agents/:agentName/stream',
      method: 'post',
      sse: true,
      func: streamAgentRun,
    },
    agentResumeOptions: {
      route: '/api/agents/:agentName/resume',
      method: 'options',
      func: pikkuSessionlessFunc<{ agentName: string }>(async () => void 0),
    },
    agentResume: {
      route: '/api/agents/:agentName/resume',
      method: 'post',
      sse: true,
      func: resumeAgentRun,
    },
    workflowRunStreamOptions: {
      route: '/api/workflow-run/:runId/stream',
      method: 'options',
      func: pikkuSessionlessFunc<{ runId: string }>(async () => void 0),
    },
    workflowRunStream: {
      route: '/api/workflow-run/:runId/stream',
      method: 'get',
      sse: true,
      func: addon('console:streamWorkflowRun'),
    },
  },
})

wireAddon({ name: 'console', package: '@pikku/addon-console' })
wireHTTPRoutes({ routes: { console: consoleRoutes } })
`
}
