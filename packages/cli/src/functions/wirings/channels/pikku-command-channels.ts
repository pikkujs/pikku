import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

const generateChannelRuntimeMeta = (meta: any) => {
  const runtimeMeta: any = {}

  for (const [channelName, channelMeta] of Object.entries(meta)) {
    const { summary, description, errors, inputTypes, ...runtime } =
      channelMeta as any

    // Process messageWirings to remove verbose fields
    if (runtime.messageWirings) {
      runtime.messageWirings = Object.entries(runtime.messageWirings).reduce(
        (acc: any, [msgType, msgWirings]: [string, any]) => {
          acc[msgType] = Object.entries(msgWirings).reduce(
            (msgAcc: any, [msgName, msgMeta]: [string, any]) => {
              const {
                summary: msgSummary,
                description: msgDescription,
                errors: msgErrors,
                ...msgRuntime
              } = msgMeta
              msgAcc[msgName] = msgRuntime
              return msgAcc
            },
            {}
          )
          return acc
        },
        {}
      )
    }

    // Process connect/disconnect/message metadata
    if (runtime.connect) {
      const {
        summary: connSummary,
        description: connDescription,
        errors: connErrors,
        ...connRuntime
      } = runtime.connect
      runtime.connect = connRuntime
    }
    if (runtime.disconnect) {
      const {
        summary: discSummary,
        description: discDescription,
        errors: discErrors,
        ...discRuntime
      } = runtime.disconnect
      runtime.disconnect = discRuntime
    }
    if (runtime.message) {
      const {
        summary: msgSummary,
        description: msgDescription,
        errors: msgErrors,
        ...msgRuntime
      } = runtime.message
      runtime.message = msgRuntime
    }

    runtimeMeta[channelName] = runtime
  }

  return runtimeMeta
}

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
      channelsWiringMetaVerboseFile,
      channelsWiringMetaVerboseJsonFile,
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

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const runtimeMeta = generateChannelRuntimeMeta(channels.meta)

    await writeFileInDir(
      logger,
      channelsWiringMetaJsonFile,
      JSON.stringify(runtimeMeta, null, 2)
    )

    const runtimeImportStatement = supportsImportAttributes
      ? `import metaData from './pikku-channels-meta.gen.json' with { type: 'json' }`
      : `import metaData from './pikku-channels-meta.gen.json'`

    await writeFileInDir(
      logger,
      channelsWiringMetaFile,
      `import { pikkuState } from '@pikku/core'\n${runtimeImportStatement}\npikkuState('channel', 'meta', metaData)`
    )

    if (config.verboseMeta) {
      await writeFileInDir(
        logger,
        channelsWiringMetaVerboseJsonFile,
        JSON.stringify(channels.meta, null, 2)
      )

      const verboseImportStatement = supportsImportAttributes
        ? `import metaData from './pikku-channels-meta.verbose.gen.json' with { type: 'json' }`
        : `import metaData from './pikku-channels-meta.verbose.gen.json'`

      await writeFileInDir(
        logger,
        channelsWiringMetaVerboseFile,
        `import { pikkuState } from '@pikku/core'\n${verboseImportStatement}\npikkuState('channel', 'meta', metaData)`
      )
    }

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding Channels',
      commandEnd: 'Found channels',
    }),
  ],
})
