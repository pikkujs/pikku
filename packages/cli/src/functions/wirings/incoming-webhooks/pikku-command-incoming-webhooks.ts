import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeIncomingWebhookDefinitions,
  serializeIncomingWebhookWiring,
} from './serialize-incoming-webhooks.js'

export const pikkuIncomingWebhooks = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const {
      incomingWebhooksFile,
      incomingWebhooksWiringFile,
      incomingWebhooksMetaJsonFile,
      packageMappings,
    } = config
    if (!incomingWebhooksFile) {
      return
    }

    const { incomingWebhooksMeta: meta = {} } = await getInspectorState()

    await writeFileInDir(
      logger,
      incomingWebhooksFile,
      serializeIncomingWebhookDefinitions({
        meta,
        incomingWebhooksFile,
        packageMappings,
      })
    )

    if (incomingWebhooksMetaJsonFile) {
      await writeFileInDir(
        logger,
        incomingWebhooksMetaJsonFile,
        JSON.stringify(meta, null, 2)
      )
    }

    if (
      !config.addon &&
      incomingWebhooksWiringFile &&
      Object.keys(meta).length > 0
    ) {
      await writeFileInDir(
        logger,
        incomingWebhooksWiringFile,
        serializeIncomingWebhookWiring({
          meta,
          incomingWebhooksWiringFile,
          packageMappings,
        })
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating incoming webhooks',
      commandEnd: 'Created incoming webhooks',
    }),
  ],
})
