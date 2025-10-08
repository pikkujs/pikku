import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeRPCWrapper } from './serialize-rpc-wrapper.js'

export const pikkuRPCClient: unknown = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig }) => {
    const { rpcWiringsFile, rpcMapDeclarationFile, packageMappings } = cliConfig

    if (!rpcWiringsFile) {
      throw new Error("rpcWiringsFile isn't set in the pikku config")
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
      skipCondition: ({ cliConfig }) => cliConfig.rpcWiringsFile === undefined,
      skipMessage: "rpcWiringsFile isn't set in the pikku config",
    }),
  ],
})
