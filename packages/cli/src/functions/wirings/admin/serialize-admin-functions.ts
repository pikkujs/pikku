export const serializeAdminFunctions = (
  leaf: (name: string) => string,
  globalHTTPPrefix: string = ''
): string => `import { ref } from '${leaf('function')}'
import { wireAddon } from '${leaf('addon')}'
import { defineHTTPRoutes, wireHTTPRoutes } from '${leaf('http')}'

export const adminRoutes = defineHTTPRoutes({
  auth: false,
  tags: ['pikku'],
  routes: {
    workflowRunStream: {
      route: '/workflow-run/:runId/stream',
      method: 'get',
      sse: true,
      auth: true,
      func: ref('admin:streamWorkflowRun'),
    },
  },
})

// No \`scopes\` here: addon scopes are required in addition to a function's own,
// so declaring \`admin\` would force the umbrella grant on every caller.
wireAddon({
  name: 'admin',
  package: '@pikku/addon-admin',
  expose: true,
  globalSecrets:
    'administering secrets and variables means reading, writing and checking any name an operator supplies at runtime, so it cannot be scoped to a declared set',
  globalCredentials:
    'administering credentials means setting and clearing any of them, for any user, and reporting whether the caller has connected the OAuth credentials agents need, which other addons declare, so it cannot be scoped to a declared set',
})
wireHTTPRoutes({ basePath: '${globalHTTPPrefix}', routes: { admin: adminRoutes } })
`
