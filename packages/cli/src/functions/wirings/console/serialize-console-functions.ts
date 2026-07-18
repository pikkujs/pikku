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
  tags: ['pikku'],
  routes: {
    workflowRunStream: {
      route: '/workflow-run/:runId/stream',
      method: 'get',
      sse: true,
      func: ref('console:streamWorkflowRun'),
    },
  },
})

// Every console-addon function carries the 'console:admin' tag so an app can
// gate the whole privileged surface (credential read/write, source editing,
// package install) with a single addTagPermission('console:admin', [...],
// '@pikku/addon-console'). Backwards-compatible: a tag with no registered
// checker resolves to allow, so apps that don't opt in are unaffected.
wireAddon({ name: 'console', package: '@pikku/addon-console', tags: ['console:admin'] })
wireHTTPRoutes({ basePath: '${globalHTTPPrefix}', routes: { console: consoleRoutes } })
`
}
