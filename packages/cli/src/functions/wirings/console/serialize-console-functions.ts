export interface ConsoleGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate the console's secret and variable functions into the project
 * scaffold.
 *
 * Emitted as two files. The schemas are zod, and the inspector reads a zod
 * schema by importing the module that declares it — which it cannot do for the
 * functions file, whose relative pikku-types import per-unit deploy codegen
 * rewrites. Keeping the schemas in a sibling module that imports nothing but
 * zod sidesteps that entirely.
 */
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

export const SecretRef = z.object({ secretId: z.string() })

export const SetSecret = z.object({
  secretId: z.string(),
  value: z.unknown(),
})

export const VariableRef = z.object({ variableId: z.string() })

export const SetVariable = z.object({
  variableId: z.string(),
  value: z.unknown(),
})

/**
 * A read that does not conflate "unset" with "set to null" — \`exists\` carries
 * that distinction, so the value alone never has to.
 */
export const ValueResult = z.object({
  exists: z.boolean(),
  value: z.unknown().nullable(),
})

export const Exists = z.object({ exists: z.boolean() })

export const Success = z.object({ success: z.boolean() })
`

  const functions = `import { pikkuFunc, defineHTTPRoutes, wireHTTPRoutes, ref, wireAddon } from '${pathToPikkuTypes}'
import {
  SecretRef,
  SetSecret,
  VariableRef,
  SetVariable,
  ValueResult,
  Exists,
  Success,
} from './console.schemas.gen.js'

export const pikkuConsoleSetSecret = pikkuFunc({
  tags: ['pikku'],
  description: 'Set the value of a secret',
  expose: true,
  input: SetSecret,
  output: Success,
  func: async ({ secrets }, { secretId, value }) => {
    await secrets.setSecret(secretId, value)
    return { success: true }
  },
})

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

export const pikkuConsoleHasSecret = pikkuFunc({
  tags: ['pikku'],
  description: 'Check if a secret exists without reading its value',
  expose: true,
  input: SecretRef,
  output: Exists,
  func: async ({ secrets }, { secretId }) => {
    const exists = await secrets.hasSecret(secretId)
    return { exists }
  },
})

export const pikkuConsoleGetSecret = pikkuFunc({
  tags: ['pikku'],
  description: 'Get the current value of a secret',
  expose: true,
  input: SecretRef,
  output: ValueResult,
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

// The console addon's functions have no authorization of their own. An app
// gates the whole privileged surface (credential read/write, source editing,
// package install) with a single package-scoped global permission —
// addGlobalPermission([isAdmin], '@pikku/addon-console') — which is resolved in
// the addon's package namespace, so it applies to every one of its functions at
// once. Apps that don't register one are unaffected (no globals => allow).
wireAddon({ name: 'console', package: '@pikku/addon-console' })
wireHTTPRoutes({ basePath: '${globalHTTPPrefix}', routes: { console: consoleRoutes } })
`

  return { schemas, functions }
}
