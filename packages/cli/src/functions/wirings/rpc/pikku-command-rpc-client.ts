import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeRPCWrapper } from './serialize-rpc-wrapper.js'

export const pikkuRPCClient: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }, interaction, data) => {
    const { rpcWiringsFile, rpcMapDeclarationFile, packageMappings } = config

    // If rpcWiringsFile is not set, clean up any existing file and return
    if (!rpcWiringsFile) {
      logger.info({
        message:
          "Skipping generating RPC wrappers since rpcWiringsFile isn't set in the pikku config.",
        type: 'skip',
      })
      return
    }

    const rpcMapDeclarationPath = getFileImportRelativePath(
      rpcWiringsFile,
      rpcMapDeclarationFile,
      packageMappings
    )
    const content = [serializeRPCWrapper(rpcMapDeclarationPath)]
    await writeFileInDir(logger, rpcWiringsFile, content.join('\n'))
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating RPC wrappers',
      commandEnd: 'Generated RPC wrappers',
    }),
  ],
})
