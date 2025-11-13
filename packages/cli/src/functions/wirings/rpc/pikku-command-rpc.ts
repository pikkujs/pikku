import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuRPC: any = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }, interaction, data) => {
    const { rpc } = await getInspectorState()
    const {
      rpcInternalWiringMetaFile,
      rpcInternalWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config

    if (rpc.internalFiles.size > 0) {
      await writeFileInDir(
        logger,
        rpcInternalWiringMetaJsonFile,
        JSON.stringify(rpc.internalMeta, null, 2)
      )

      const jsonImportPath = getFileImportRelativePath(
        rpcInternalWiringMetaFile,
        rpcInternalWiringMetaJsonFile,
        packageMappings
      )

      const supportsImportAttributes = schema?.supportsImportAttributes ?? false
      const importStatement = supportsImportAttributes
        ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
        : `import metaData from '${jsonImportPath}'`

      await writeFileInDir(
        logger,
        rpcInternalWiringMetaFile,
        `import { pikkuState } from '@pikku/core'\n${importStatement}\npikkuState('rpc', 'meta', metaData as Record<string, string>)`
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding RPCs tasks',
      commandEnd: 'Found RPCs',
    }),
  ],
})
