import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { serializeTypedChannelsMap } from './serialize-typed-channel-map.js'
import { PikkuCommand } from '../../types.js'

export const pikkuChannelsMap: PikkuCommand = async (
  logger,
  { channelsMapDeclarationFile, packageMappings },
  state
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating channels map',
    'Created channels map',
    [state.channels.files.size === 0],
    async () => {
      const content = serializeTypedChannelsMap(
        channelsMapDeclarationFile,
        packageMappings,
        state.functions.typesMap,
        state.functions.meta,
        state.channels.meta
      )
      await writeFileInDir(logger, channelsMapDeclarationFile, content)
    }
  )
}
