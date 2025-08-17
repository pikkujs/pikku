import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { serializeTypedRPCMap } from './serialize-typed-rpc-map.js'
import { PikkuCommand } from '../../types.js'

export const pikkuRPCInternalMap: PikkuCommand = async (
  logger,
  { rpcInternalMapDeclarationFile, packageMappings },
  { functions, rpc }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating RPC internal map',
    'Created RPC internal map',
    [false],
    async () => {
      const content = serializeTypedRPCMap(
        rpcInternalMapDeclarationFile,
        packageMappings,
        functions.typesMap,
        functions.meta,
        rpc.internalMeta
      )
      await writeFileInDir(logger, rpcInternalMapDeclarationFile, content)
    }
  )
}

export const pikkuRPCExposedMap: PikkuCommand = async (
  logger,
  { rpcMapDeclarationFile, packageMappings },
  { functions, rpc }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating RPC external map',
    'Created RPC external map',
    [false],
    async () => {
      const content = serializeTypedRPCMap(
        rpcMapDeclarationFile,
        packageMappings,
        functions.typesMap,
        functions.meta,
        rpc.exposedMeta
      )
      await writeFileInDir(logger, rpcMapDeclarationFile, content)
    }
  )
}
