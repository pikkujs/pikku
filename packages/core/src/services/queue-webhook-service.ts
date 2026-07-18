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

/** Cap on the response body captured on a failed attempt. */
const MAX_CAPTURED_RESPONSE_BODY = 2_000

/**
 * Default {@link WebhookService} implementation: serializes and signs the
 * payload, then enqueues a delivery job onto the `pikku-outgoing-webhooks`
 * queue. The signature is computed at enqueue time so the signing key never
 * enters the queue payload; the actual HTTP POST happens in
 * {@link pikkuWebhookWorkerFunc}, and the queue's `attempts`/`backoff`
 * options drive retries.
 */
export class QueueWebhookService extends WebhookService {
  /**
   * The queue is a constructor dependency rather than a `getSingletonServices()`
   * lookup so that a project wiring up outgoing webhooks without a queue fails
   * to compile, instead of throwing on the first `send()`.
   */
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
   * Build the signed job payload and its retry options — the shared work a
   * `send()` does before enqueueing. Factored out (and `protected`) so a
   * store-backed subclass can persist a delivery row and attach its
   * `deliveryId` without re-implementing signing or the retry policy.
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
      // Naive read — any caching is the secret service's concern, not ours.
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

  /**
   * Resolve a delivery's retry policy into queue job options, mirroring the
   * workflow service: per-call values win over `config.webhook` defaults, an
   * explicitly-set `retries` (including 0) is always honored, and `attempts`
   * is ALWAYS passed so the queue can never fall back to its own default.
   * Backoff is exponential unless a concrete `retryDelay` selects a fixed one.
   */
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

/**
 * Queue worker for the `pikku-outgoing-webhooks` queue: POSTs the delivery to its
 * target URL. Any non-2xx response (or network error) throws so the queue
 * retries the job according to the `attempts`/`backoff` set at enqueue time;
 * the queue runner logs each failed attempt.
 *
 * A `deliveryId` is only present when a store-backed `webhookService` (e.g.
 * `KyselyWebhookService`) enqueued the job, so each attempt (success or failure)
 * is persisted via `webhookService.recordAttempt` before the throw — the console
 * delivery history reflects every try, not just the outcome. The queue-only
 * default never sets a `deliveryId`, so its base `recordAttempt` is never hit.
 */
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
    // Singleton services not initialised (e.g. a bare worker invocation) — fall
    // back to the default private-host block with no allowlist.
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
    // Best-effort history: a store failure must not mask the delivery result.
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
