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

export const consoleRoutes = defineHTTPRoutes({
  auth: false,
  routes: {
    workflowRunStream: {
      route: '/workflow-run/:runId/stream',
      method: 'get',
      sse: true,
      func: ref('console:streamWorkflowRun'),
    },
    // A route rather than an RPC because a <video> and an <img> take a URL.
    // Authenticated even though the group is not: everything else here is
    // metadata, and these are recordings of an application being used.
    // `path` arrives as a query parameter rather than trailing segments: an
    // artifact key contains slashes, and a route that swallowed them would have
    // to decide where the key ends.
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
  globalSecrets:
    'the console administers secrets an operator names at runtime, so no static declaration can cover them',
  globalCredentials:
    'the console reports whether the caller has connected the OAuth credentials an agent needs, which are declared by other addons',
})
wireAddon({
  name: 'admin',
  package: '@pikku/addon-admin',
  globalCredentials:
    'administering credentials means setting and clearing any of them, for any user, so it cannot be scoped to a declared set',
})
wireHTTPRoutes({ basePath: '', routes: { console: consoleRoutes } })
