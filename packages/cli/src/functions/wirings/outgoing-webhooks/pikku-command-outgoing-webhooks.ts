import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  buildWebhooksMeta,
  serializeWebhooks,
} from './serialize-outgoing-webhooks.js'

export const pikkuOutgoingWebhooks = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const {
      outgoingWebhooksFile,
      outgoingWebhooksMetaJsonFile,
      packageMappings,
    } = config
    if (!outgoingWebhooksFile) {
      return
    }

    const { outgoingWebhooks: webhooks = [] } = await getInspectorState()

    await writeFileInDir(
      logger,
      outgoingWebhooksFile,
      serializeWebhooks({ webhooks, outgoingWebhooksFile, packageMappings })
    )

    if (outgoingWebhooksMetaJsonFile) {
      await writeFileInDir(
        logger,
        outgoingWebhooksMetaJsonFile,
        JSON.stringify(buildWebhooksMeta(webhooks), null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating outgoing webhooks',
      commandEnd: 'Created outgoing webhooks',
    }),
  ],
})
