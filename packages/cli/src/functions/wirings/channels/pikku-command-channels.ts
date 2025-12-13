import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

export const pikkuChannels: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
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

    // Write minimal JSON (runtime-only fields)
    const minimalMeta = stripVerboseFields(channels.meta)
    await writeFileInDir(
      logger,
      channelsWiringMetaJsonFile,
      JSON.stringify(minimalMeta, null, 2)
    )

    // Write verbose JSON only if it has additional fields
    if (hasVerboseFields(channels.meta)) {
      const verbosePath = channelsWiringMetaJsonFile.replace(
        /\.gen\.json$/,
        '-verbose.gen.json'
      )
      await writeFileInDir(
        logger,
        verbosePath,
        JSON.stringify(channels.meta, null, 2)
      )
    }

    // Generate TypeScript file that imports the minimal JSON
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
      `import { pikkuState } from '@pikku/core'\nimport type { ChannelsMeta } from '@pikku/core/channel'\n${importStatement}\npikkuState(null, 'channel', 'meta', metaData as ChannelsMeta)`
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
