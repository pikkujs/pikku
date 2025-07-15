import { serializeRPCWrapper } from './serialize-rpc-wrapper.js'
import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'

export const pikkuRPCClient: PikkuCommandWithoutState = async (
  logger,
  { rpcFile, rpcMapDeclarationFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Generating RPC wrapper',
    'Generated RPC wrapper',
    [rpcFile === undefined, "rpcFile isn't set in the pikku config"],
    async () => {
      if (!rpcFile) {
        throw new Error("rpcFile isn't set in the pikku config")
      }

      const rpcMapDeclarationPath = getFileImportRelativePath(
        rpcFile,
        rpcMapDeclarationFile,
        packageMappings
      )

      const content = [serializeRPCWrapper(rpcMapDeclarationPath)]
      await writeFileInDir(logger, rpcFile, content.join('\n'))
    }
  )
}
