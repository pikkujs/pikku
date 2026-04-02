import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePublicRPC } from './serialize-public-rpc.js'

export const pikkuPublicRPC = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const { exposedMeta, exposedFiles } = state.rpc

    if (Object.keys(exposedMeta).length === 0) {
      return false
    }

    const outputFile =
      config.publicRpcFile ??
      config.typesDeclarationFile.replace(
        'pikku-types.gen.ts',
        'rpc/pikku-public-rpc.wiring.gen.ts'
      )

    const pathToPikkuTypes = getFileImportRelativePath(
      outputFile,
      config.typesDeclarationFile,
      config.packageMappings
    )

    // Build the exposed functions map with file paths
    const exposedFunctions: Record<
      string,
      { path: string; exportedName: string; pikkuFuncId: string }
    > = {}

    for (const [funcName, pikkuFuncId] of Object.entries(exposedMeta)) {
      const fileInfo = exposedFiles.get(funcName)
      if (fileInfo) {
        exposedFunctions[funcName] = {
          path: fileInfo.path,
          exportedName: fileInfo.exportedName,
          pikkuFuncId,
        }
      }
    }

    const content = serializePublicRPC(
      outputFile,
      pathToPikkuTypes,
      exposedFunctions,
      config.packageMappings,
      config.globalHTTPPrefix || ''
    )

    if (!content) {
      return false
    }

    await writeFileInDir(logger, outputFile, content)
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Public RPC Routes',
      commandEnd: 'Generated Public RPC Routes',
    }),
  ],
})
