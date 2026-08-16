export interface ConsoleGenOutput {
  schemas: string
  functions: string
}

export const serializeConsoleFunctions = (
  pathToPikkuTypes: string,
  _pathToAgentTypes: string,
  globalHTTPPrefix: string = ''
): ConsoleGenOutput => {
  const schemas = `/**
 * Auto-generated console function schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

export const VariableRef = z.object({ variableId: z.string() })

export const SetVariable = z.object({
  variableId: z.string(),
  value: z.unknown(),
})

export const ValueResult = z.object({
  exists: z.boolean(),
  value: z.unknown().nullable(),
})

export const Success = z.object({ success: z.boolean() })
`

  const functions = `import { pikkuFunc, defineHTTPRoutes, wireHTTPRoutes, ref, wireAddon } from '${pathToPikkuTypes}'
import {
  VariableRef,
  SetVariable,
  ValueResult,
  Success,
} from './console.schemas.gen.js'

export const pikkuConsoleGetVariable = pikkuFunc({
  tags: ['pikku'],
  description: 'Get the current value of a variable',
  expose: true,
  input: VariableRef,
  output: ValueResult,
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

export const pikkuConsoleSetVariable = pikkuFunc({
  tags: ['pikku'],
  description: 'Set the value of a variable',
  expose: true,
  input: SetVariable,
  output: Success,
  func: async ({ variables }, { variableId, value }) => {
    if (typeof value === 'string') {
      await variables.set(variableId, value)
    } else {
      await variables.set(variableId, value)
    }
    return { success: true }
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
    // A route rather than an RPC because a <video> and an <img> take a URL.
    // Authenticated even though the group is not: everything else here is
    // metadata, and these are recordings of an application being used. \`path\`
    // arrives as a query parameter because an artifact key contains slashes.
    scenarioArtifact: {
      route: '/scenario-run/:runId/artifact',
      method: 'get',
      auth: true,
      func: ref('console:getScenarioArtifact'),
    },
  },
})

wireAddon({
  name: 'console',
  package: '@pikku/addon-console',
  scopes: ['admin'],
  globalSecrets:
    'the console administers secrets an operator names at runtime, so no static declaration can cover them',
  globalCredentials:
    'the console lists and links credentials across every user, so it cannot be scoped to a declared set',
})
wireHTTPRoutes({ basePath: '${globalHTTPPrefix}', routes: { console: consoleRoutes } })
`

  return { schemas, functions }
}
