export interface ConsoleGenOutput {
  schemas: string
  functions: string
}

export const serializeConsoleFunctions = (
  leaf: (name: string) => string,
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

  const functions = `import { pikkuFunc, ref } from '${leaf('function')}'
import { wireAddon } from '${leaf('addon')}'
import { defineHTTPRoutes, wireHTTPRoutes } from '${leaf('http')}'
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
    const value = await variables.get(variableId)
    return { exists: true, value }
  },
})

export const pikkuConsoleSetVariable = pikkuFunc({
  tags: ['pikku'],
  description: 'Set the value of a variable',
  expose: true,
  input: SetVariable,
  output: Success,
  func: async ({ variables }, { variableId, value }) => {
    await variables.set(variableId, value)
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

// The console's own root, not \`admin\`: administering the application (users,
// roles, credentials, the audit trail) is \`@pikku/addon-admin\` under the
// \`admin\` tree, and the two are granted separately. Addon scopes union with
// each function's, so this is the floor for reaching the console at all.
wireAddon({
  name: 'console',
  package: '@pikku/addon-console',
  scopes: ['pikku:console'],
  globalSecrets:
    'the console administers secrets an operator names at runtime, so no static declaration can cover them',
  globalCredentials:
    'the console reports whether the caller has connected the OAuth credentials an agent needs, which are declared by other addons',
})
wireHTTPRoutes({ basePath: '${globalHTTPPrefix}', routes: { console: consoleRoutes } })
`

  return { schemas, functions }
}
