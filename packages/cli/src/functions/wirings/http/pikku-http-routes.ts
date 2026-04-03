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
  const imports = new Map<string, Set<string>>()
  let needsWireHTTP = false
  let needsRemoteMiddleware = false

  for (const methodRoutes of Object.values(meta)) {
    for (const routeMeta of Object.values(methodRoutes)) {
      if (
        !routeMeta.synthetic ||
        !routeMeta.sourceFile ||
        !routeMeta.exportedName
      ) {
        continue
      }
      needsWireHTTP = true
      const isRemote = routeMeta.tags?.includes('pikku:remote')
      if (isRemote) {
        needsRemoteMiddleware = true
      }

      const filePath = getFileImportRelativePath(
        httpWiringsFile,
        routeMeta.sourceFile,
        packageMappings
      )
      if (!imports.has(filePath)) {
        imports.set(filePath, new Set())
      }
      imports.get(filePath)!.add(routeMeta.exportedName)
    }
  }

  if (!needsWireHTTP) return ''

  lines.push('')
  lines.push(
    '/* Auto-generated wireHTTP calls for exposed/remote RPC routes */'
  )
  lines.push("import { wireHTTP } from '@pikku/core/http'")
  if (needsRemoteMiddleware) {
    lines.push(
      "import { pikkuRemoteAuthMiddleware } from '@pikku/core/middleware'"
    )
  }

  for (const [filePath, names] of imports) {
    lines.push(`import { ${[...names].join(', ')} } from '${filePath}'`)
  }
  lines.push('')

  for (const methodRoutes of Object.values(meta)) {
    for (const routeMeta of Object.values(methodRoutes)) {
      if (
        !routeMeta.synthetic ||
        !routeMeta.sourceFile ||
        !routeMeta.exportedName
      ) {
        continue
      }
      const isRemote = routeMeta.tags?.includes('pikku:remote')
      lines.push(`wireHTTP({`)
      lines.push(`  route: '${routeMeta.route}',`)
      lines.push(`  method: '${routeMeta.method}',`)
      lines.push(`  auth: false,`)
      if (isRemote) {
        lines.push(`  middleware: [pikkuRemoteAuthMiddleware],`)
      }
      lines.push(`  func: ${routeMeta.exportedName},`)
      lines.push(`})`)
    }
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
