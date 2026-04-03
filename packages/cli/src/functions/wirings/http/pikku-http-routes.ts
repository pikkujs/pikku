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

  // Collect synthetic routes that have user source files
  const syntheticRoutes: Array<{ routeMeta: any; isRemote: boolean }> = []

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

      syntheticRoutes.push({ routeMeta, isRemote })
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

  for (const { routeMeta, isRemote } of syntheticRoutes) {
    // Remote routes use auth: false — pikkuRemoteAuthMiddleware handles
    // JWT verification and session restoration before the function runs
    const auth = isRemote ? false : (routeMeta.syntheticAuth ?? true)
    lines.push(`wireHTTP({`)
    lines.push(`  route: '${routeMeta.route}',`)
    lines.push(`  method: '${routeMeta.method}',`)
    lines.push(`  auth: ${auth},`)
    if (isRemote) {
      lines.push(`  middleware: [pikkuRemoteAuthMiddleware],`)
    }
    lines.push(`  func: ${routeMeta.exportedName} as any,`)
    lines.push(`})`)
  }

  // Auto-wire synthetic routes that need inline runtime handlers.
  // These routes are in the meta (from post-process) but have no user source
  // file — the handler is generated inline.
  for (const methodRoutes of Object.values(meta)) {
    for (const routeMeta of Object.values(methodRoutes)) {
      // Generic RPC catch-all for addon namespaced calls
      if (
        routeMeta.route?.endsWith('/rpc/:rpcName') &&
        routeMeta.method === 'post'
      ) {
        lines.push(`wireHTTP({`)
        lines.push(`  route: '${routeMeta.route}',`)
        lines.push(`  method: 'post',`)
        lines.push(`  auth: false,`)
        lines.push(
          `  func: { func: async (_services: any, { rpcName, data }: any, { rpc }: any) => rpc.exposed(rpcName, data) } as any,`
        )
        lines.push(`})`)
      }
      if (
        routeMeta.route?.endsWith('/rpc/:rpcName') &&
        routeMeta.method === 'options'
      ) {
        lines.push(`wireHTTP({`)
        lines.push(`  route: '${routeMeta.route}',`)
        lines.push(`  method: 'options',`)
        lines.push(`  auth: false,`)
        lines.push(`  func: { func: async () => void 0 } as any,`)
        lines.push(`})`)
      }

      // Agent routes — call rpc.agent methods directly
      const funcId = routeMeta.pikkuFuncId
      if (funcId?.startsWith('agentRun:')) {
        const name = funcId.slice('agentRun:'.length)
        lines.push(
          `wireHTTP({ route: '${routeMeta.route}', method: '${routeMeta.method}', auth: false,`
        )
        lines.push(
          `  func: { func: async (_s: any, data: any, { rpc }: any) => rpc.agent.run('${name}', data) } as any })`
        )
      } else if (funcId?.startsWith('agentStream:')) {
        const name = funcId.slice('agentStream:'.length)
        lines.push(
          `wireHTTP({ route: '${routeMeta.route}', method: '${routeMeta.method}', auth: false,`
        )
        lines.push(
          `  func: { func: async (_s: any, data: any, { rpc }: any) => rpc.agent.stream('${name}', data) } as any })`
        )
      } else if (funcId?.startsWith('agentApprove:')) {
        const name = funcId.slice('agentApprove:'.length)
        lines.push(
          `wireHTTP({ route: '${routeMeta.route}', method: '${routeMeta.method}', auth: false,`
        )
        lines.push(
          `  func: { func: async (_s: any, data: any, { rpc }: any) => rpc.agent.approve(data.runId, data.approvals, '${name}') } as any })`
        )
      } else if (funcId?.startsWith('agentResume:')) {
        const name = funcId.slice('agentResume:'.length)
        lines.push(
          `wireHTTP({ route: '${routeMeta.route}', method: '${routeMeta.method}', auth: false,`
        )
        lines.push(
          `  func: { func: async (_s: any, data: any, { rpc }: any) => rpc.agent.resume(data.runId, data) } as any })`
        )
      }
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
