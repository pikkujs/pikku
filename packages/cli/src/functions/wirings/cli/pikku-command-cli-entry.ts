import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { join } from 'node:path'
import { serializeLocalCLIBootstrap } from './serialize-local-cli-bootstrap.js'
import { serializeChannelCLI } from './serialize-channel-cli.js'
import {
  serializeChannelCLIClient,
  collectRendererNames,
} from './serialize-channel-cli-client.js'
import { existsSync } from 'fs'
import { rm } from 'fs/promises'
import { ErrorCode } from '@pikku/inspector'

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
      const programMeta = visitState.cli.meta.programs[programName]

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
            ? 'local'
            : entrypointConfig.type || 'local'

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
            config.channelsTypesFile,
            config.functionTypesFile,
            channelName,
            channelRoute
          )

          await writeFileInDir(logger, channelWireFile, channelCode)
          logger.debug(
            `Serialized CLI channel for ${programName}: ${channelWireFile}`
          )

          // Generate client code if clientPath is provided
          if (channelClientPath) {
            const channelClientFile = join(config.rootDir, channelClientPath)

            // Validate that renderers don't depend on services (client-side renderers can't access server services)
            const rendererNames = collectRendererNames(programMeta)
            const problematicRenderers: Array<{
              name: string
              services: string[]
            }> = []

            for (const rendererName of rendererNames) {
              const rendererMeta = visitState.cli.meta.renderers[rendererName]
              if (rendererMeta?.services?.services?.length > 0) {
                problematicRenderers.push({
                  name: rendererName,
                  services: rendererMeta.services.services,
                })
              }
            }

            // If any renderers depend on services, abort client generation
            if (problematicRenderers.length > 0) {
              const details = problematicRenderers
                .map(
                  (r) => `  - ${r.name} depends on: ${r.services.join(', ')}`
                )
                .join('\n')

              logger.critical(
                ErrorCode.CLI_CLIENTSIDE_RENDERER_HAS_SERVICES,
                `Cannot generate CLI channel client for '${programName}': renderers cannot depend on services (client-side execution)\n${details}\n\nRenderers used in CLI-over-channel must be service-free since they execute on the client.`
              )

              // Delete existing client file if it exists
              if (existsSync(channelClientFile)) {
                await rm(channelClientFile)
                logger.debug(
                  `Deleted existing CLI channel client: ${channelClientFile}`
                )
              }

              continue
            }

            const clientCode = serializeChannelCLIClient(
              programName,
              programMeta,
              channelClientFile,
              config,
              config.bootstrapFile,
              channelRoute,
              visitState.cli.meta.renderers
            )

            await writeFileInDir(logger, channelClientFile, clientCode)
            logger.debug(
              `Serialized CLI channel client for ${programName}: ${channelClientFile}`
            )
          }

          continue
        }

        // Handle local CLI type entrypoint (default)
        const entrypointPath =
          typeof entrypointConfig === 'string'
            ? entrypointConfig
            : entrypointConfig.type === 'local'
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
          wireServicesFactory: true,
        })

        const {
          pikkuConfigFactory,
          singletonServicesFactory,
          wireServicesFactory,
        } = visitState.filesAndMethods

        if (
          !pikkuConfigFactory ||
          !singletonServicesFactory ||
          !wireServicesFactory
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
          wireServicesFactory
        )

        await writeFileInDir(logger, bootstrapFile, bootstrapCode)
        logger.debug(
          `Serialized CLI bootstrap for ${programName}: ${bootstrapFile}`
        )
      }
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Serializing CLI',
      commandEnd: 'Serialized CLI',
    }),
  ],
})
