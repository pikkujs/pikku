import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

export const pikkuCommandChannels = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      channelsWiringFile,
      channelsWiringMetaFile,
      channelsWiringMetaJsonFile,
      channelContractsMetaJsonFile,
      channelContractsMetaFile,
      packageMappings,
      schema,
    } = config
    const { channels, exportedContracts } = visitState
    const hasChannelContracts =
      Object.keys(exportedContracts.channel).length > 0

    if (
      (channels.files.size === 0 || Object.keys(channels.meta).length === 0) &&
      !hasChannelContracts
    ) {
      return undefined
    }

    // The bootstrap imports channelsWiringFile and channelsWiringMetaFile
    // whenever this command reports channels as active (truthy return), so both
    // must always be written once past the guard above — including the
    // contracts-only case where there are no local channel source files
    // (channels.files is empty). Skipping either leaves the bootstrap importing
    // a file that was never generated and the per-unit deploy bundle fails.
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

    const minimalMeta = stripVerboseFields(channels.meta)
    await writeFileInDir(
      logger,
      channelsWiringMetaJsonFile,
      JSON.stringify(minimalMeta, null, 2)
    )

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

    await writeFileInDir(
      logger,
      channelContractsMetaJsonFile,
      JSON.stringify(exportedContracts.channel, null, 2)
    )

    if (hasChannelContracts) {
      const contractsJsonImportPath = getFileImportRelativePath(
        channelContractsMetaFile,
        channelContractsMetaJsonFile,
        packageMappings
      )
      const supportsImportAttributes = schema?.supportsImportAttributes ?? false
      const contractsImportStatement = supportsImportAttributes
        ? `import contractsMeta from '${contractsJsonImportPath}' with { type: 'json' }`
        : `import contractsMeta from '${contractsJsonImportPath}'`

      await writeFileInDir(
        logger,
        channelContractsMetaFile,
        `${contractsImportStatement}\nexport default contractsMeta`
      )
    }

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
      `import { pikkuState } from '@pikku/core/internal'\nimport type { ChannelsMeta } from '@pikku/core/channel'\n${importStatement}\npikkuState(null, 'channel', 'meta', metaData as ChannelsMeta)`
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
