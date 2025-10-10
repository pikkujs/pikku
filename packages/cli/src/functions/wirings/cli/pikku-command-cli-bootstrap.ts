import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getPikkuFilesAndMethods } from '../../../utils/pikku-files-and-methods.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { join } from 'node:path'
import { serializeLocalCLIBootstrap } from './serialize-local-cli-bootstrap.js'

export const pikkuCLIBootstrap: any = pikkuSessionlessFunc<void, void>({
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
    for (const [programName, entrypointConfig] of Object.entries(
      config.cli.entrypoints
    )) {
      const programMeta = visitState.cli.meta[programName]

      if (!programMeta) {
        logger.warn(
          `CLI program '${programName}' not found in metadata, skipping`
        )
        continue
      }

      // Normalize entrypoint config to object form
      const entrypointPath =
        typeof entrypointConfig === 'string'
          ? entrypointConfig
          : entrypointConfig.path

      const bootstrapFile = join(config.rootDir, entrypointPath)

      // Get service factories for local mode
      const {
        pikkuConfigFactory,
        singletonServicesFactory,
        sessionServicesFactory,
      } = await getPikkuFilesAndMethods(
        logger,
        visitState,
        config.packageMappings,
        bootstrapFile,
        {}, // options
        {
          config: true,
          singletonServicesFactory: true,
          sessionServicesFactory: true,
        }
      )

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
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Serializing CLI bootstrap',
      commandEnd: 'Serialized CLI bootstrap',
      skipCondition: async ({ getInspectorState }) => {
        const visitState = await getInspectorState()
        return visitState.cli.files.size === 0
      },
      skipMessage: 'none found',
    }),
  ],
})
