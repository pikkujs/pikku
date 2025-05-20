import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { logCommandInfoAndTime, writeFileInDir } from '../src/utils/utils.js'

export const pikkuRPC = async (
  { rpcMetaFile }: PikkuCLIConfig,
  { rpc }: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding RPCs tasks',
    'Found RPCs',
    [false],
    async () => {
      await writeFileInDir(
        rpcMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('rpc', 'meta', ${JSON.stringify(rpc.meta, null, 2)})`
      )
    }
  )
}
