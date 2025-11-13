import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeRemoteRPC } from './serialize-remote-rpc.js'
import { join } from 'path'

export const pikkuRemoteRPC: any = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }, interaction, data) => {
    if (config.rpc?.remoteRpcWorkersPath) {
      const remoteRpcPath = join(
        config.rootDir,
        config.rpc.remoteRpcWorkersPath
      )
      const pathToPikkuTypes = getFileImportRelativePath(
        remoteRpcPath,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        remoteRpcPath,
        serializeRemoteRPC(pathToPikkuTypes)
      )
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
