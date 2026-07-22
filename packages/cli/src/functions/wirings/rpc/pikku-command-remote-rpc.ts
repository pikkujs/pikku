import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeRemoteRPC } from './serialize-remote-rpc.js'

export const pikkuRemoteRPC = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    const deployCodegenFlag = await variables.get('PIKKU_DEPLOY_CODEGEN')
    if (deployCodegenFlag === '1') {
      return false
    }

    if (config.remoteRpcWorkersFile && config.remoteRpcSchemasFile) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.remoteRpcWorkersFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      const { schemas, functions } = serializeRemoteRPC(pathToPikkuTypes)
      await writeFileInDir(logger, config.remoteRpcSchemasFile, schemas)
      await writeFileInDir(logger, config.remoteRpcWorkersFile, functions)
      await removeLegacyScaffoldFile(config.remoteRpcWorkersFile)
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Remote RPC Workers',
      commandEnd: 'Generated Remote RPC Workers',
    }),
  ],
})
