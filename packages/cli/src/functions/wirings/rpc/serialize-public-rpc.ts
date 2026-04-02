import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

/**
 * Generate per-function HTTP routes for exposed RPC functions.
 * Each function with `expose: true` gets `POST /rpc/{funcName}`.
 */
export const serializePublicRPC = (
  outputPath: string,
  pathToPikkuTypes: string,
  exposedFunctions: Record<
    string,
    { path: string; exportedName: string; pikkuFuncId: string }
  >,
  packageMappings: Record<string, string>,
  globalHTTPPrefix: string = ''
): string | null => {
  const entries = Object.entries(exposedFunctions)
  if (entries.length === 0) return null

  const imports = new Set<string>()
  imports.add(
    `import { defineHTTPRoutes, wireHTTPRoutes } from '${pathToPikkuTypes}'`
  )

  const routeEntries: string[] = []

  for (const [funcName, info] of entries) {
    const importPath = getFileImportRelativePath(
      outputPath,
      info.path,
      packageMappings
    )
    imports.add(`import { ${info.exportedName} } from '${importPath}'`)

    routeEntries.push(`    '${funcName}': {
      route: '${globalHTTPPrefix}/rpc/${funcName}',
      method: 'post',
      func: ${info.exportedName},
    },`)
  }

  return `${[...imports].join('\n')}

export const exposedRpcRoutes = defineHTTPRoutes({
  auth: false,
  tags: ['pikku:public'],
  routes: {
${routeEntries.join('\n')}
  },
})

wireHTTPRoutes({ routes: { rpc: exposedRpcRoutes } })
`
}
