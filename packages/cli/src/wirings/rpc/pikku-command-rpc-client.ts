import { serializeRPCWrapper } from './serialize-rpc-wrapper.js'
import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'

export const pikkuRPCClient: PikkuCommandWithoutState = async (
  logger,
  {
    rpcWiringsFile,
    rpcMapDeclarationFile,
    rpcInternalMapDeclarationFile,
    packageMappings,
  }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Generating RPC wrappers',
    'Generated RPC wrappers',
    [
      rpcWiringsFile === undefined || rpcWiringsFile === null,
      "rpcWiringsFile isn't set in the pikku config",
    ],
    async () => {
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
    }
  )
}
