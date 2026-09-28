import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import {
  upsertIncomingWebhooks,
  type IncomingWebhooksMeta,
} from '@pikku/core/webhook'
import { pikkuSessionlessFunc } from '#pikku/function'
import { loadUserModule } from './load-user-project.js'

/**
 * Converges every incoming webhook with its provider and prints one JSON line
 * per webhook. A produced signing secret is printed for the caller to store;
 * nothing is written to disk.
 */
export const webhooksUpsert = pikkuSessionlessFunc<
  { url: string; labelPrefix: string },
  void
>({
  func: async ({ logger, config }, { url, labelPrefix }) => {
    const { incomingWebhooksFile, incomingWebhooksMetaJsonFile } = config
    if (!existsSync(incomingWebhooksMetaJsonFile)) {
      throw new Error(
        `${incomingWebhooksMetaJsonFile} does not exist. Run pikku all first.`
      )
    }
    const meta: IncomingWebhooksMeta = JSON.parse(
      await readFile(incomingWebhooksMetaJsonFile, 'utf-8')
    )
    if (Object.keys(meta).length === 0) {
      logger.info('No incoming webhooks are declared.')
      return
    }

    const { incomingWebhooks } = await loadUserModule(incomingWebhooksFile)
    const outcomes = await upsertIncomingWebhooks({
      definitions: incomingWebhooks,
      meta,
      baseUrl: url,
      labelPrefix,
      getSecret: async (name) => process.env[name],
      logger,
    })

    for (const outcome of outcomes) {
      process.stdout.write(`${JSON.stringify(outcome)}\n`)
    }
    const failed = outcomes.filter((outcome) => outcome.status === 'failed')
    if (failed.length > 0) {
      throw new Error(
        `${failed.length} incoming webhook(s) failed: ${failed.map((outcome) => outcome.id).join(', ')}`
      )
    }
  },
})
