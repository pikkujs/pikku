import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

/**
 * Generates wireHTTP() calls for synthetic routes (injected by the inspector
 * post-process for exposed/remote RPC functions, agents, workflows).
 *
 * These routes exist in http.meta but have no user-written wiring file.
 * We generate inline wireHTTP() calls importing the function from its source.
 */
function serializeSyntheticRoutes(
  httpWiringsFile: string,
  meta: Record<string, Record<string, any>>,
  packageMappings: Record<string, string>
): string {
  const lines: string[] = []
  // User file imports: Map<filePath, Set<exportedName>>
  const userImports = new Map<string, Set<string>>()
  // Framework imports: Map<packagePath, Set<factoryName>>
  const frameworkImports = new Map<string, Set<string>>()
  let needsWireHTTP = false
  let needsRemoteMiddleware = false

  // Collect all synthetic routes
  const syntheticRoutes: Array<{ routeMeta: any; isRemote: boolean }> = []

  for (const methodRoutes of Object.values(meta)) {
    for (const routeMeta of Object.values(methodRoutes)) {
      if (!routeMeta.synthetic) continue

      // Must have either user source or framework source
      const hasUserSource = routeMeta.sourceFile && routeMeta.exportedName
      const hasFrameworkSource = routeMeta.syntheticSource
      if (!hasUserSource && !hasFrameworkSource) continue

      needsWireHTTP = true
      const isRemote = routeMeta.tags?.includes('pikku:remote')
      if (isRemote) {
        needsRemoteMiddleware = true
      }

      if (hasUserSource) {
        const filePath = getFileImportRelativePath(
          httpWiringsFile,
          routeMeta.sourceFile,
          packageMappings
        )
        if (!userImports.has(filePath)) {
          userImports.set(filePath, new Set())
        }
        userImports.get(filePath)!.add(routeMeta.exportedName)
      }

      if (hasFrameworkSource) {
        const src = routeMeta.syntheticSource
        if (!frameworkImports.has(src.importPath)) {
          frameworkImports.set(src.importPath, new Set())
        }
        frameworkImports.get(src.importPath)!.add(src.factoryName)
      }

      syntheticRoutes.push({ routeMeta, isRemote })
    }
  }

  if (!needsWireHTTP) return ''

  lines.push('')
  lines.push('/* Auto-generated wireHTTP calls for synthetic routes */')
  lines.push("import { wireHTTP } from '@pikku/core/http'")
  if (needsRemoteMiddleware) {
    lines.push(
      "import { pikkuRemoteAuthMiddleware } from '@pikku/core/middleware'"
    )
  }

  for (const [filePath, names] of userImports) {
    lines.push(`import { ${[...names].join(', ')} } from '${filePath}'`)
  }
  for (const [pkgPath, names] of frameworkImports) {
    lines.push(`import { ${[...names].join(', ')} } from '${pkgPath}'`)
  }
  lines.push('')

  for (const { routeMeta, isRemote } of syntheticRoutes) {
    const auth = isRemote ? true : (routeMeta.syntheticAuth ?? true)
    let funcExpr: string

    if (routeMeta.syntheticSource) {
      const src = routeMeta.syntheticSource
      funcExpr = src.factoryArg
        ? `${src.factoryName}('${src.factoryArg}') as any`
        : `${src.factoryName} as any`
    } else {
      funcExpr = `${routeMeta.exportedName} as any`
    }

    lines.push(`wireHTTP({`)
    lines.push(`  route: '${routeMeta.route}',`)
    lines.push(`  method: '${routeMeta.method}',`)
    lines.push(`  auth: ${auth},`)
    if (isRemote) {
      lines.push(`  middleware: [pikkuRemoteAuthMiddleware],`)
    }
    lines.push(`  func: ${funcExpr},`)
    lines.push(`})`)
  }

  return lines.join('\n')
}

export const pikkuHTTP = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      httpWiringsFile,
      httpWiringMetaFile,
      httpWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config
    const { http } = visitState

    if (http.files.size === 0 && Object.keys(http.meta).length === 0) {
      return false
    }

    const userFileImports = serializeFileImports(
      'wireHTTP',
      httpWiringsFile,
      http.files,
      packageMappings
    )
    const syntheticRoutes = serializeSyntheticRoutes(
      httpWiringsFile,
      http.meta,
      packageMappings
    )

    await writeFileInDir(
      logger,
      httpWiringsFile,
      userFileImports + syntheticRoutes
    )

    await writeFileInDir(
      logger,
      httpWiringMetaJsonFile,
      JSON.stringify(http.meta, null, 2)
    )

    const jsonImportPath = getFileImportRelativePath(
      httpWiringMetaFile,
      httpWiringMetaJsonFile,
      packageMappings
    )

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const importStatement = supportsImportAttributes
      ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
      : `import metaData from '${jsonImportPath}'`

    await writeFileInDir(
      logger,
      httpWiringMetaFile,
      `import { pikkuState } from '@pikku/core/internal'\nimport type { HTTPWiringsMeta } from '@pikku/core/http'\n${importStatement}\npikkuState(null, 'http', 'meta', metaData as HTTPWiringsMeta)`
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding HTTP routes',
      commandEnd: 'Found HTTP routes',
    }),
  ],
})
