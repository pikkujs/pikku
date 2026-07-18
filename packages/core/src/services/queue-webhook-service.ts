import { getSingletonServices } from '../pikku-state.js'
import { getDurationInMilliseconds } from '../time-utils.js'
import type { CoreSingletonServices } from '../types/core.types.js'
import type { JobOptions, QueueService } from '../wirings/queue/queue.types.js'
import {
  DEFAULT_WEBHOOK_RETRIES,
  DEFAULT_WEBHOOK_SIGNATURE_HEADER,
  PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
  type SendWebhookInput,
  type SendWebhookResult,
  type WebhookJobData,
  WebhookService,
} from './webhook-service.js'

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
  /** Resolved config secrets, keyed by secret name, to avoid re-resolving. */
  private resolvedSecrets = new Map<string, string>()

  constructor(private queueService: QueueService) {
    super()
  }

  public async send(input: SendWebhookInput): Promise<SendWebhookResult> {
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
      secret = await this.resolveConfigSecret(services, webhookConfig.secret)
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

    const jobId = await this.queueService.add(
      PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
      jobData,
      this.resolveJobOptions(input)
    )
    return { jobId }
  }

  /**
   * Resolve the config-level signing secret by name, caching it so repeated
   * `send()` calls don't re-hit the secret service. A configured secret that
   * resolves to nothing is a misconfiguration — the delivery would go out
   * unsigned and the receiver reject it — so it's logged loudly (and not
   * cached, so a later fix takes effect without a restart).
   */
  private async resolveConfigSecret(
    services: CoreSingletonServices,
    secretName: string
  ): Promise<string | undefined> {
    const cached = this.resolvedSecrets.get(secretName)
    if (cached !== undefined) {
      return cached
    }
    const secret = await services.secrets.getSecret(secretName)
    if (!secret) {
      services.logger.error(
        `Webhook signing secret '${secretName}' (config.webhook.secret) resolved to nothing — outgoing webhooks will be sent UNSIGNED.`
      )
      return undefined
    }
    this.resolvedSecrets.set(secretName, secret)
    return secret
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
