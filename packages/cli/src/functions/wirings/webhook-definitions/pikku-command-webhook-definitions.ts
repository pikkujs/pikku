import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  buildWebhooksMeta,
  serializeWebhooks,
} from './serialize-webhook-definitions.js'

export const pikkuWebhookDefinitions = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { webhooksFile, webhooksMetaJsonFile, packageMappings } = config
    if (!webhooksFile) {
      return
    }

    const { webhooks = [] } = await getInspectorState()

    await writeFileInDir(
      logger,
      webhooksFile,
      serializeWebhooks({ webhooks, webhooksFile, packageMappings })
    )

    if (webhooksMetaJsonFile) {
      await writeFileInDir(
        logger,
        webhooksMetaJsonFile,
        JSON.stringify(buildWebhooksMeta(webhooks), null, 2)
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating webhook definitions',
      commandEnd: 'Created webhook definitions',
    }),
  ],
})
