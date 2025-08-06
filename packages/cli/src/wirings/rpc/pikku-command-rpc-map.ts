import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { serializeTypedRPCMap } from './serialize-typed-rpc-map.js'
import { PikkuCommand } from '../../types.js'

export const pikkuRPCMap: PikkuCommand = async (
  logger,
  { rpcMapDeclarationFile, packageMappings },
  { functions, rpc }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating RPC map',
    'Created RPC map',
    [false],
    async () => {
      const content = serializeTypedRPCMap(
        rpcMapDeclarationFile,
        packageMappings,
        functions.typesMap,
        functions.meta,
        rpc.meta
      )
      await writeFileInDir(logger, rpcMapDeclarationFile, content)
    }
  )
}
