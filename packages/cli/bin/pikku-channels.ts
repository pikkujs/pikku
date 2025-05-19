import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../src/utils/utils.js'

export const pikkuChannels = async (
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding Channels',
    'Found channels',
    [visitState.channels.files.size === 0],
    async () => {
      const { channelsFile, channelsMetaFile, packageMappings } = cliConfig
      const { channels } = visitState
      await writeFileInDir(
        channelsFile,
        serializeFileImports(
          'addChannel',
          channelsFile,
          channels.files,
          packageMappings
        )
      )
      await writeFileInDir(
        channelsMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('channel', 'meta', ${JSON.stringify(channels.meta, null, 2)})`
      )
    }
  )
}
