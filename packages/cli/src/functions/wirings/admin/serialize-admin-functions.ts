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
  globalCredentials:
    'administering credentials means setting and clearing any of them, for any user, so it cannot be scoped to a declared set',
})
wireHTTPRoutes({ basePath: '${globalHTTPPrefix}', routes: { admin: adminRoutes } })
`
