import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { logCommandInfoAndTime, writeFileInDir } from '../src/utils/utils.js'
import { serializeTypedRPCMap } from '../src/serialize-typed-rpc-map.js'

export const pikkuRPCMap = async (
  { rpcMapDeclarationFile, packageMappings }: PikkuCLIConfig,
  { functions, rpc }: InspectorState
) => {
  return await logCommandInfoAndTime(
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
      await writeFileInDir(rpcMapDeclarationFile, content)
    }
  )
}
