import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { logCommandInfoAndTime, writeFileInDir } from '../src/utils.js'

export const pikkuRPC = async (
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding RPCs tasks',
    'Found rpcs',
    [visitState.functions.files.size === 0],
    async () => {
      const { rpcFile } = cliConfig
      const { rpc } = visitState
      await writeFileInDir(
        rpcFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('rpc', 'meta', ${JSON.stringify(rpc.meta, null, 2)})`
      )
    }
  )
}
