import { getSingletonServices } from '../pikku-state.js'
import { getDurationInMilliseconds } from '../time-utils.js'
import type { JobOptions, QueueService } from '../wirings/queue/queue.types.js'
import {
  PIKKU_WEBHOOK_QUEUE_NAME,
  type SendWebhookInput,
  type SendWebhookResult,
  type WebhookJobData,
  type WebhookService,
} from './webhook-service.js'
import { signWebhookBody } from './webhook-signature.js'

export const DEFAULT_WEBHOOK_RETRIES = 3

/**
 * Default {@link WebhookService} implementation: serializes and signs the
 * payload, then enqueues a delivery job onto the `pikku-webhooks` queue.
 * The signature is computed at enqueue time so the signing key never enters
 * the queue payload; the actual HTTP POST happens in
 * {@link pikkuWebhookWorkerFunc}, and the queue's `attempts`/`backoff`
 * options drive retries.
 */
export class QueueWebhookService implements WebhookService {
  public async send(input: SendWebhookInput): Promise<SendWebhookResult> {
    const services = getSingletonServices()
    const queueService = this.verifyQueueService()
    const webhookConfig = services.config?.webhook

    const body = JSON.stringify(input.data)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(input.event ? { 'X-Pikku-Event': input.event } : {}),
      ...input.headers,
    }

    let secret = input.secret
    if (secret === undefined && webhookConfig?.secret) {
      secret = await services.secrets.getSecret(webhookConfig.secret)
    }
    if (secret) {
      headers['X-Pikku-Signature'] = signWebhookBody(secret, body)
    }

    const jobData: WebhookJobData = {
      url: input.url,
      ...(input.event ? { event: input.event } : {}),
      body,
      headers,
    }

    const jobId = await queueService.add(
      PIKKU_WEBHOOK_QUEUE_NAME,
      jobData,
      this.resolveJobOptions(input)
    )
    return { jobId }
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

  private verifyQueueService(): QueueService {
    const queueService = getSingletonServices()?.queueService
    if (!queueService) {
      throw new Error(
        'QueueService not configured. Outgoing webhooks require a queue service.'
      )
    }
    return queueService
  }
}

/**
 * Queue worker for the `pikku-webhooks` queue: POSTs the delivery to its
 * target URL. Any non-2xx response (or network error) throws so the queue
 * retries the job according to the `attempts`/`backoff` set at enqueue time;
 * the queue runner logs each failed attempt.
 */
export async function pikkuWebhookWorkerFunc(
  _services: unknown,
  { url, body, headers }: WebhookJobData
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Webhook delivery to ${url} failed with status ${response.status}`
    )
  }
}
