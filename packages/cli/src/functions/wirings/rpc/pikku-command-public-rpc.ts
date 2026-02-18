import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePublicRPC } from './serialize-public-rpc.js'
import { join } from 'path'

export const pikkuPublicRPC = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.rpc?.publicRpcPath) {
      const publicRpcPath = join(config.rootDir, config.rpc.publicRpcPath)
      const pathToPikkuTypes = getFileImportRelativePath(
        publicRpcPath,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        publicRpcPath,
        serializePublicRPC(
          pathToPikkuTypes,
          config.rpc.publicRpcRequireAuth ?? true
        )
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Public RPC Endpoint',
      commandEnd: 'Generated Public RPC Endpoint',
    }),
  ],
})
