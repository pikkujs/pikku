import { pikkuVoidFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuChannels: any = pikkuVoidFunc({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      channelsWiringFile,
      channelsWiringMetaFile,
      channelsWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config
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

    // Write JSON file
    await writeFileInDir(
      logger,
      channelsWiringMetaJsonFile,
      JSON.stringify(channels.meta, null, 2)
    )

    // Calculate relative path from TS file to JSON file
    const jsonImportPath = getFileImportRelativePath(
      channelsWiringMetaFile,
      channelsWiringMetaJsonFile,
      packageMappings
    )

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const importStatement = supportsImportAttributes
      ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
      : `import metaData from '${jsonImportPath}'`

    await writeFileInDir(
      logger,
      channelsWiringMetaFile,
      `import { pikkuState } from '@pikku/core'\nimport { ChannelsMeta } from '@pikku/core/channel'\n${importStatement}\npikkuState('channel', 'meta', metaData as ChannelsMeta)`
    )
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding Channels',
      commandEnd: 'Found channels',
    }),
  ],
})
