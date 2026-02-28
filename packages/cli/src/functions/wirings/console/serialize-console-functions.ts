export const serializeConsoleFunctions = (
  pathToPikkuTypes: string,
  _pathToAgentTypes: string
) => {
  return `import { pikkuSessionlessFunc, defineHTTPRoutes, wireHTTPRoutes, addon, wireAddon } from '${pathToPikkuTypes}'

export const pikkuConsoleSetSecret = pikkuSessionlessFunc<{
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

export const pikkuConsoleGetVariable = pikkuSessionlessFunc<
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

export const pikkuConsoleSetVariable = pikkuSessionlessFunc<
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

export const pikkuConsoleGetSecret = pikkuSessionlessFunc<
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
