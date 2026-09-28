import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  WEBHOOK_SOURCE_SCHEMAS,
  serializeWebhookSourceWirings,
  serializeWebhookSourcesLifecycle,
} from './serialize-webhook-sources.js'

/** Returns true when it wrote wirings, so the caller re-inspects to mount them. */
export const pikkuWebhookSources = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const meta = state.triggers.webhookSourceMeta
    if (Object.keys(meta).length === 0) {
      return false
    }

    const { webhookSourcesFile, webhookSourcesLifecycleFile, packageMappings } =
      config
    const schemasFile = webhookSourcesFile.replace(
      /\.gen\.ts$/,
      '.schemas.gen.ts'
    )
    await writeFileInDir(logger, schemasFile, WEBHOOK_SOURCE_SCHEMAS)
    await writeFileInDir(
      logger,
      webhookSourcesFile,
      serializeWebhookSourceWirings(
        meta,
        (name) => getLeafImportPath(webhookSourcesFile, name, config),
        getFileImportRelativePath(
          webhookSourcesFile,
          schemasFile,
          packageMappings
        )
      )
    )

    const { pikkuConfigFactory, singletonServicesFactory } =
      state.filesAndMethods
    if (singletonServicesFactory) {
      const path = (file: string) =>
        getFileImportRelativePath(
          webhookSourcesLifecycleFile,
          file,
          packageMappings
        )
      await writeFileInDir(
        logger,
        webhookSourcesLifecycleFile,
        serializeWebhookSourcesLifecycle({
          bootstrapPath: path(config.bootstrapFile),
          ...(pikkuConfigFactory
            ? {
                pikkuConfigFactory: {
                  path: path(pikkuConfigFactory.file),
                  variable: pikkuConfigFactory.variable,
                },
              }
            : {}),
          singletonServicesFactory: {
            path: path(singletonServicesFactory.file),
            variable: singletonServicesFactory.variable,
          },
        })
      )
    } else {
      logger.warn(
        'Webhook sources are wired but no singleton services factory was found, so `pikku webhooks` cannot run their lifecycle.'
      )
    }
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating webhook sources',
      commandEnd: 'Generated webhook sources',
    }),
  ],
})
