import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeRPCWrapper } from './serialize-rpc-wrapper.js'

export const pikkuRPCClient: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { rpcWiringsFile, rpcMapDeclarationFile, packageMappings } = config

    if (!rpcWiringsFile) {
      return
      // TODO:  throw new Error("rpcWiringsFile isn't set in the pikku config")
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
      skipCondition: ({ config }) => config.rpcWiringsFile === undefined,
      skipMessage: "rpcWiringsFile isn't set in the pikku config",
    }),
  ],
})
