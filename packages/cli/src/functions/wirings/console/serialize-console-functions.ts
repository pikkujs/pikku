export const serializeConsoleFunctions = (
  pathToPikkuTypes: string,
  pathToAgentTypes: string
) => {
  return `import { pikkuSessionlessFunc, defineHTTPRoutes, wireHTTPRoutes, addon, wireAddon } from '${pathToPikkuTypes}'
import { agentStream, agentResume } from '${pathToAgentTypes}'

export const setSecret = pikkuSessionlessFunc<{
  secretId: string
  value: unknown
}, {
  success: boolean
}>({
  description: 'Set the value of a secret',
  expose: true,
  auth: false,
  func: async ({ secrets }, { secretId, value }) => {
    await secrets.setSecretJSON(secretId, value)
    return { success: true }
  },
})

export const getVariable = pikkuSessionlessFunc<
  { variableId: string },
  { exists: boolean; value: unknown | null }
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

export const setVariable = pikkuSessionlessFunc<
  { variableId: string; value: unknown },
  { success: boolean }
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

export const getSecret = pikkuSessionlessFunc<
  { secretId: string },
  { exists: boolean; value: unknown | null }
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

export const consoleRoutes = defineHTTPRoutes({
  auth: false,
  routes: {
    agentStream: {
      route: '/agents/:agentName/stream',
      method: 'post',
      sse: true,
      func: agentStream(),
    },
    agentResume: {
      route: '/agents/resume',
      method: 'post',
      sse: true,
      func: agentResume(),
    },
    workflowRunStream: {
      route: '/workflow-run/:runId/stream',
      method: 'get',
      sse: true,
      func: addon('console:streamWorkflowRun'),
    },
  },
})

wireAddon({ name: 'console', package: '@pikku/addon-console' })
wireHTTPRoutes({ baseRoute: '/api', routes: { console: consoleRoutes } })
`
}
