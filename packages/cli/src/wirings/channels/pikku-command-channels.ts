import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommand } from '../../types.js'

export const pikkuChannels: PikkuCommand = async (
  logger,
  cliConfig,
  visitState
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding Channels',
    'Found channels',
    [visitState.channels.files.size === 0],
    async () => {
      const { channelsWiringFile, channelsWiringMetaFile, packageMappings } =
        cliConfig
      const { channels } = visitState
      await writeFileInDir(
        logger,
        channelsWiringFile,
        serializeFileImports(
          'addChannel',
          channelsWiringFile,
          channels.files,
          packageMappings
        )
      )
      await writeFileInDir(
        logger,
        channelsWiringMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('channel', 'meta', ${JSON.stringify(channels.meta, null, 2)})`
      )
    }
  )
}
