import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { logCommandInfoAndTime, writeFileInDir } from '../src/utils/utils.js'
import { serializeTypedChannelsMap } from '../src/serialize-typed-channel-map.js'

export const pikkuChannelsMap = async (
  { channelsMapDeclarationFile, packageMappings }: PikkuCLIConfig,
  state: InspectorState
) => {
  return await logCommandInfoAndTime(
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
      await writeFileInDir(channelsMapDeclarationFile, content)
    }
  )
}
