import { PikkuCLIConfig } from '../../pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommand } from '../../types.js'

export const pikkuChannels: PikkuCommand = async (
  logger,
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding Channels',
    'Found channels',
    [visitState.channels.files.size === 0],
    async () => {
      const { channelsFile, channelsMetaFile, packageMappings } = cliConfig
      const { channels } = visitState
      await writeFileInDir(
        logger,
        channelsFile,
        serializeFileImports(
          'addChannel',
          channelsFile,
          channels.files,
          packageMappings
        )
      )
      await writeFileInDir(
        logger,
        channelsMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('channel', 'meta', ${JSON.stringify(channels.meta, null, 2)})`
      )
    }
  )
}
