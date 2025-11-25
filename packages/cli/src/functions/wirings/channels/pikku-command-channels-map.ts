import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeTypedChannelsMap } from './serialize-typed-channel-map.js'

export const pikkuChannelsMap: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const { channelsMapDeclarationFile, packageMappings } = config

    const content = serializeTypedChannelsMap(
      channelsMapDeclarationFile,
      packageMappings,
      state.functions.typesMap,
      state.functions.meta,
      state.channels.meta,
      state.functions.zodSchemas
    )
    await writeFileInDir(logger, channelsMapDeclarationFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating channels map',
      commandEnd: 'Created channels map',
    }),
  ],
})
