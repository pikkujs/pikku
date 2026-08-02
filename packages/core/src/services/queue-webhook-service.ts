import { getSingletonServices } from '../pikku-state.js'
import { getDurationInMilliseconds } from '../time-utils.js'
import { safeFetch } from '../utils/safe-fetch.js'
import type { JobOptions, QueueService } from '../wirings/queue/queue.types.js'
import type { Logger } from './logger.js'
import {
  DEFAULT_WEBHOOK_RETRIES,
  DEFAULT_WEBHOOK_SIGNATURE_HEADER,
  PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
  type SendWebhookInput,
  type SendWebhookResult,
  type WebhookJobData,
  WebhookService,
} from './webhook-service.js'

const MAX_CAPTURED_RESPONSE_BODY = 2_000

// knowledge: decisions/security/webhook-bodies-are-signed-before-they-are-enqueued.md
export class QueueWebhookService extends WebhookService {
  // knowledge: decisions/internals/webhook-service-collaborators-are-constructor-args-not-locator-lookups.md
  constructor(protected queueService: QueueService) {
    super()
  }

  public async send(input: SendWebhookInput): Promise<SendWebhookResult> {
    const { jobData, options } = await this.prepareDelivery(input)
    const jobId = await this.queueService.add(
      PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
      jobData,
      options
    )
    return { jobId }
  }

  /**
   * `protected` so a store-backed subclass can persist a delivery row and attach
   * its `deliveryId` without re-implementing signing or the retry policy.
   */
  protected async prepareDelivery(
    input: SendWebhookInput
  ): Promise<{ jobData: WebhookJobData; options: JobOptions }> {
    const services = getSingletonServices()
    const webhookConfig = services.config?.webhook

    const body = JSON.stringify(input.data)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(input.event ? { 'X-Pikku-Event': input.event } : {}),
      ...input.headers,
    }

    let secret = input.secret
    if (secret === undefined && webhookConfig?.secret) {
      // Naive read: caching is the secret service's concern, not ours.
      secret = await services.secrets.getSecret(webhookConfig.secret)
      if (!secret) {
        services.logger.error(
          `Webhook signing secret '${webhookConfig.secret}' (config.webhook.secret) resolved to nothing — outgoing webhooks will be sent UNSIGNED.`
        )
      }
    }
    if (secret) {
      const signatureHeader =
        webhookConfig?.signatureHeader ?? DEFAULT_WEBHOOK_SIGNATURE_HEADER
      headers[signatureHeader] = this.sign(secret, body)
    }

    const jobData: WebhookJobData = {
      url: input.url,
      ...(input.event ? { event: input.event } : {}),
      body,
      headers,
    }

    return { jobData, options: this.resolveJobOptions(input) }
  }

  // knowledge: decisions/internals/queue-jobs-always-carry-an-explicit-attempts-count.md
  private resolveJobOptions(input: SendWebhookInput): JobOptions {
    const webhookConfig = getSingletonServices().config?.webhook
    const retries =
      input.retries ?? webhookConfig?.retries ?? DEFAULT_WEBHOOK_RETRIES
    const retryDelay = input.retryDelay ?? webhookConfig?.retryDelay
    const backoff =
      retryDelay !== undefined && retryDelay !== 'exponential'
        ? { type: 'fixed', delay: getDurationInMilliseconds(retryDelay) }
        : retries > 0 || retryDelay === 'exponential'
          ? 'exponential'
          : undefined
    return { attempts: retries + 1, ...(backoff ? { backoff } : {}) }
  }
}

// knowledge: decisions/internals/webhook-delivery-history-records-every-attempt-best-effort.md
export async function pikkuWebhookWorkerFunc(
  services: { logger: Logger; webhookService?: WebhookService },
  { url, body, headers, deliveryId }: WebhookJobData
): Promise<void> {
  let statusCode: number | undefined
  let responseBody: string | undefined
  let error: string | undefined
  let delivered = false

  let allowedHosts: string[] | undefined
  try {
    allowedHosts = getSingletonServices().config?.webhook?.allowedHosts
  } catch {
    // Uninitialised singletons (a bare worker invocation): fall back to the
    // default private-host block rather than failing the delivery.
  }

  try {
    const response = await safeFetch(
      url,
      {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30_000),
      },
      { allowedHosts }
    )
    statusCode = response.status
    delivered = response.status >= 200 && response.status < 300
    if (!delivered) {
      responseBody = (await response.text().catch(() => ''))?.slice(
        0,
        MAX_CAPTURED_RESPONSE_BODY
      )
      error = `Webhook delivery to ${url} failed with status ${response.status}`
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  if (deliveryId && services.webhookService) {
    await services.webhookService
      .recordAttempt(deliveryId, { statusCode, responseBody, error, delivered })
      .catch((storeError) =>
        services.logger.error(
          `Failed to record webhook delivery attempt for ${deliveryId}`,
          storeError
        )
      )
  }

  if (!delivered) {
    throw new Error(error ?? `Webhook delivery to ${url} failed`)
  }
}
