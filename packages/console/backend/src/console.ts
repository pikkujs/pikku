// Hand-authored console wiring for the console's *own* codegen backend.
//
// This project only exists to generate the typed console client
// (rpc-map/http-map/fetch) that the React console app imports — it is never run
// as a server, so there is no session/auth to enforce here. We therefore wire
// the console addon manually instead of via `scaffold.console`, which (from the
// feat/cli-audit change) now hard-requires a `pikkuBetterAuth(...)` strategy and
// would otherwise fail codegen for this auth-less type-gen harness. Real
// consumer projects still scaffold the console the normal (authenticated) way.
import {
  pikkuSessionlessFunc,
  defineHTTPRoutes,
  wireHTTPRoutes,
  ref,
  wireAddon,
} from '../.pikku/pikku-types.gen.js'

export const pikkuConsoleSetSecret = pikkuSessionlessFunc<
  {
    secretId: string
    value: unknown
  },
  {
    success: boolean
  }
>({
  tags: ['pikku'],
  description: 'Set the value of a secret',
  expose: true,
  auth: false,
  func: async ({ secrets }, { secretId, value }) => {
    await secrets.setSecret(secretId, value)
    return { success: true }
  },
})

export const pikkuConsoleGetVariable = pikkuSessionlessFunc<
  { variableId: string },
  { exists: boolean; value: unknown | null }
>({
  tags: ['pikku'],
  description: 'Get the current value of a variable',
  expose: true,
  auth: false,
  func: async ({ variables }, { variableId }) => {
    const exists = await variables.has(variableId)
    if (!exists) {
      return { exists: false, value: null }
    }
    const value = await variables.get(variableId)
    return { exists: true, value }
  },
})

export const pikkuConsoleSetVariable = pikkuSessionlessFunc<
  { variableId: string; value: unknown },
  { success: boolean }
>({
  tags: ['pikku'],
  description: 'Set the value of a variable',
  expose: true,
  auth: false,
  func: async ({ variables }, { variableId, value }) => {
    await variables.set(variableId, value)
    return { success: true }
  },
})

export const pikkuConsoleHasSecret = pikkuSessionlessFunc<
  { secretId: string },
  { exists: boolean }
>({
  tags: ['pikku'],
  description: 'Check if a secret exists without reading its value',
  expose: true,
  auth: false,
  func: async ({ secrets }, { secretId }) => {
    const exists = await secrets.hasSecret(secretId)
    return { exists }
  },
})

export const pikkuConsoleGetSecret = pikkuSessionlessFunc<
  { secretId: string },
  { exists: boolean; value: unknown | null }
>({
  tags: ['pikku'],
  description: 'Get the current value of a secret',
  expose: true,
  auth: false,
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
  },
})

wireAddon({ name: 'console', package: '@pikku/addon-console' })
wireHTTPRoutes({ basePath: '', routes: { console: consoleRoutes } })
