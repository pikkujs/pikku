import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuChannels: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const { channelsWiringFile, channelsWiringMetaFile, packageMappings } =
      config
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
      `import { pikkuState } from '@pikku/core'\npikkuState(null, 'channel', 'meta', ${JSON.stringify(channels.meta, null, 2)})`
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding Channels',
      commandEnd: 'Found channels',
    }),
  ],
})
