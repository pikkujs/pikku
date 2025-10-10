import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { join } from 'node:path'
import { serializeLocalCLIBootstrap } from './serialize-local-cli-bootstrap.js'
import { serializeChannelCLI } from './serialize-channel-cli.js'

export const pikkuCLIEntry: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    // Check if CLI entrypoints are configured
    if (
      !config.cli?.entrypoints ||
      Object.keys(config.cli.entrypoints).length === 0
    ) {
      logger.info({
        message:
          'No CLI entrypoints configured in config.cli.entrypoints, skipping CLI bootstrap generation',
        type: 'skip',
      })
      return
    }

    // Generate bootstrap files for each configured entrypoint
    for (const [programName, entrypointConfigs] of Object.entries(
      config.cli.entrypoints
    )) {
      const programMeta = visitState.cli.meta[programName]

      if (!programMeta) {
        logger.warn(
          `CLI program '${programName}' not found in metadata, skipping`
        )
        continue
      }

      // Normalize to array
      const configs = Array.isArray(entrypointConfigs)
        ? entrypointConfigs
        : [entrypointConfigs]

      for (const entrypointConfig of configs) {
        // Normalize entrypoint config to get type
        const entrypointType =
          typeof entrypointConfig === 'string'
            ? 'cli'
            : entrypointConfig.type || 'cli'

        // Handle channel type entrypoint
        if (entrypointType === 'channel') {
          if (
            typeof entrypointConfig === 'string' ||
            entrypointConfig.type !== 'channel'
          ) {
            throw new Error('Channel entrypoint must be a channel type object')
          }

          const channelWirePath = entrypointConfig.wirePath
          const channelClientPath = entrypointConfig.path
          const channelName = entrypointConfig.name
          const channelRoute = entrypointConfig.route

          const channelWireFile = join(config.rootDir, channelWirePath)

          const channelCode = serializeChannelCLI(
            programName,
            programMeta,
            channelWireFile,
            visitState.functions.files,
            config.packageMappings,
            channelName,
            channelRoute
          )

          await writeFileInDir(logger, channelWireFile, channelCode)
          logger.info(
            `Serialized CLI channel for ${programName}: ${channelWireFile}`
          )

          // TODO: Generate client code if clientPath is provided
          if (channelClientPath) {
            logger.info(
              `TODO: Generate channel client for ${programName}: ${channelClientPath}`
            )
          }

          continue
        }

        // Handle CLI type entrypoint (default)
        const entrypointPath =
          typeof entrypointConfig === 'string'
            ? entrypointConfig
            : entrypointConfig.type === 'cli'
              ? entrypointConfig.path
              : undefined

        if (!entrypointPath) {
          throw new Error(
            `CLI entrypoint must have a path: ${JSON.stringify(entrypointConfig)}`
          )
        }

        const bootstrapFile = join(config.rootDir, entrypointPath)

        // Get service factories for local mode
        // Check for required types
        checkRequiredTypes(visitState.filesAndMethodsErrors, {
          config: true,
          singletonServicesFactory: true,
          sessionServicesFactory: true,
        })

        const {
          pikkuConfigFactory,
          singletonServicesFactory,
          sessionServicesFactory,
        } = visitState.filesAndMethods

        if (
          !pikkuConfigFactory ||
          !singletonServicesFactory ||
          !sessionServicesFactory
        ) {
          throw new Error('Required types not found')
        }

        const bootstrapCode = serializeLocalCLIBootstrap(
          programName,
          programMeta,
          bootstrapFile,
          config,
          pikkuConfigFactory,
          singletonServicesFactory,
          sessionServicesFactory
        )

        await writeFileInDir(logger, bootstrapFile, bootstrapCode)
        logger.info(
          `Serialized CLI bootstrap for ${programName}: ${bootstrapFile}`
        )
      }
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Serializing CLI',
      commandEnd: 'Serialized CLI',
      skipCondition: async ({ getInspectorState }) => {
        const visitState = await getInspectorState()
        return visitState.cli.files.size === 0
      },
      skipMessage: 'none found',
    }),
  ],
})
