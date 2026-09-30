import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import type { WebhookSourceOutcome } from '@pikku/core/trigger'
import type { Logger } from '@pikku/core/services'
import { pikkuSessionlessFunc } from '#pikku/function'
import { loadUserModule } from './load-user-project.js'

export type WebhooksInput = {
  url: string
  labelPrefix: string
  previous?: string
}

/**
 * Runs one lifecycle step for every webhook source through the app's own
 * services and prints one JSON line per source. A signing secret the provider
 * issues is stored by the source's own `setup`, in the credential store, so
 * it never passes through here.
 */
const runWebhooks = async (
  action: 'check' | 'setup' | 'teardown',
  logger: Logger,
  webhookSourcesLifecycleFile: string,
  { url, labelPrefix, previous }: WebhooksInput
) => {
  if (!url || !labelPrefix) {
    throw new Error(
      '--url and --labelPrefix are required: the label is how a later run finds the endpoints this one registers'
    )
  }
  if (!existsSync(webhookSourcesLifecycleFile)) {
    logger.info(
      `No webhook sources are wired (${webhookSourcesLifecycleFile} does not exist; run pikku all first if they are).`
    )
    return
  }
  const { runWebhookSources } = await loadUserModule(
    webhookSourcesLifecycleFile
  )
  const outcomes: WebhookSourceOutcome[] = await runWebhookSources({
    action,
    baseUrl: url,
    labelPrefix,
    previous: previous ? JSON.parse(await readFile(previous, 'utf-8')) : {},
  })

  for (const outcome of outcomes) {
    process.stdout.write(`${JSON.stringify(outcome)}\n`)
  }
  const failed = outcomes.filter((outcome) => outcome.status === 'failed')
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} webhook source(s) failed: ${failed.map((outcome) => outcome.source).join(', ')}`
    )
  }
}

export const webhooksStatus = pikkuSessionlessFunc<WebhooksInput, void>({
  func: async ({ logger, config }, data) =>
    runWebhooks('check', logger, config.webhookSourcesLifecycleFile, data),
})

export const webhooksSetup = pikkuSessionlessFunc<WebhooksInput, void>({
  func: async ({ logger, config }, data) =>
    runWebhooks('setup', logger, config.webhookSourcesLifecycleFile, data),
})

export const webhooksTeardown = pikkuSessionlessFunc<WebhooksInput, void>({
  func: async ({ logger, config }, data) =>
    runWebhooks('teardown', logger, config.webhookSourcesLifecycleFile, data),
})
