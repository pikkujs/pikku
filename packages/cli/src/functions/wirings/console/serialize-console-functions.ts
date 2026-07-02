export const serializeConsoleFunctions = (
  pathToPikkuTypes: string,
  _pathToAgentTypes: string,
  globalHTTPPrefix: string = ''
) => {
  return `import { pikkuFunc, defineHTTPRoutes, wireHTTPRoutes, ref, wireAddon } from '${pathToPikkuTypes}'

export const pikkuConsoleSetSecret = pikkuFunc<{
  secretId: string
  value: unknown
}, {
  success: boolean
}>({
  tags: ['pikku'],
  description: 'Set the value of a secret',
  expose: true,
  func: async ({ secrets }, { secretId, value }) => {
    await secrets.setSecret(secretId, value)
    return { success: true }
  },
})

export const pikkuConsoleGetVariable = pikkuFunc<
  { variableId: string },
  { exists: boolean; value: unknown | null }
>({
  tags: ['pikku'],
  description: 'Get the current value of a variable',
  expose: true,
  func: async ({ variables }, { variableId }) => {
    const exists = await variables.has(variableId)
    if (!exists) {
      return { exists: false, value: null }
    }
    try {
      const value = await variables.get(variableId)
      return { exists: true, value }
    } catch {
      const value = await variables.get(variableId)
      return { exists: true, value }
    }
  },
})

export const pikkuConsoleSetVariable = pikkuFunc<
  { variableId: string; value: unknown },
  { success: boolean }
>({
  tags: ['pikku'],
  description: 'Set the value of a variable',
  expose: true,
  func: async ({ variables }, { variableId, value }) => {
    if (typeof value === 'string') {
      await variables.set(variableId, value)
    } else {
      await variables.set(variableId, value)
    }
    return { success: true }
  },
})

export const pikkuConsoleHasSecret = pikkuFunc<
  { secretId: string },
  { exists: boolean }
>({
  tags: ['pikku'],
  description: 'Check if a secret exists without reading its value',
  expose: true,
  func: async ({ secrets }, { secretId }) => {
    const exists = await secrets.hasSecret(secretId)
    return { exists }
  },
})

export const pikkuConsoleGetSecret = pikkuFunc<
  { secretId: string },
  { exists: boolean; value: unknown | null }
>({
  tags: ['pikku'],
  description: 'Get the current value of a secret',
  expose: true,
  func: async ({ secrets }, { secretId }) => {
    const exists = await secrets.hasSecret(secretId)
    if (!exists) {
      return { exists: false, value: null }
    }
    const value = await secrets.getSecret(secretId)
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
      func: ref('console:streamWorkflowRun'),
    },
    functionTestsStream: {
      route: '/function-tests/stream',
      method: 'get',
      sse: true,
      func: ref('console:streamFunctionTests'),
    },
  },
})

wireAddon({ name: 'console', package: '@pikku/addon-console' })
wireHTTPRoutes({ basePath: '${globalHTTPPrefix}', routes: { console: consoleRoutes } })
`
}
