import { NotImplementedError } from '../errors/errors.js'
import { hmacSha256Hex, timingSafeStringEqual } from '../utils/hmac.js'
import type { Safe } from '../classification/secret-value.js'

/** One outgoing webhook to send. */
export interface SendWebhookInput {
  url: string
  /** Sent as the `X-Pikku-Event` header. */
  event?: string
  data: unknown
  headers?: Record<string, string>
  /** A raw HMAC key, not a secret name — overrides `config.webhook.secret`. */
  secret?: string
  /** Overrides `config.webhook.retries`. */
  retries?: number
  /** A concrete delay (`30000` or `'30s'`) selects fixed backoff; omitted means exponential. */
  retryDelay?: string | number
  /** Persisted only by store-backed implementations; the queue-only default ignores it. */
  organizationId?: string
}

/** The queue job that will deliver the webhook. */
export interface SendWebhookResult {
  jobId: string
  /**
   * The delivery row's id, which is what `getDelivery` reads back. Present only
   * on store-backed implementations. It is not interchangeable with `jobId`: a
   * broker is free to assign its own identity — the JetStream queue returns a
   * stream sequence — so a caller that hands `jobId` to `getDelivery` looks up
   * an id that was never written.
   */
  deliveryId?: string
}

/**
 * The `webhook` section of your config: signing secret, signature header, retry
 * policy and the hosts webhooks may be sent to.
 */
export interface WebhookServiceConfig {
  retries?: number
  /** Omitted means exponential backoff. */
  retryDelay?: string | number
  /** A secret *name* resolved through the secret service, unlike `SendWebhookInput.secret`. */
  secret?: string
  signatureHeader?: string
  /**
   * SSRF allowlist. Set: only these hostnames may be delivered to. Omitted:
   * private/internal hosts are blocked and every other public host is allowed.
   */
  allowedHosts?: string[]
}

/** A signed webhook as queued for delivery. */
export interface WebhookJobData {
  url: string
  event?: string
  body: string
  headers: Record<string, string>
  /**
   * Present only when a store-backed implementation enqueued the job. Doubles
   * as the queue `jobId`, so it is stable across retries.
   */
  deliveryId?: string
}

/** The outcome of one delivery attempt. */
export interface WebhookAttemptResult {
  /** Absent when the request never completed. */
  statusCode?: number
  /** Truncated; captured on failure only. */
  responseBody?: string
  error?: string
  delivered: boolean
}

/** A stored webhook delivery and its current status. */
export interface WebhookDeliveryRecord {
  deliveryId: string
  organizationId: string | null
  url: string
  event: string | null
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  createdAt: Date
  updatedAt: Date
  deliveredAt: Date | null
}

export interface WebhookAttemptRecord {
  attemptId: string
  deliveryId: string
  attemptNumber: number
  statusCode: number | null
  responseBody: string | null
  error: string | null
  createdAt: Date
}

/** A stored webhook delivery with every attempt made. */
export interface WebhookDeliveryWithAttempts {
  delivery: WebhookDeliveryRecord
  attempts: WebhookAttemptRecord[]
}

/** The queue outgoing webhooks are delivered through. */
export const PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME = 'pikku-outgoing-webhooks'

export const DEFAULT_WEBHOOK_SIGNATURE_HEADER = 'X-Pikku-Signature'

/**
 * How many times a failed webhook delivery is retried when nothing else is
 * configured.
 */
export const DEFAULT_WEBHOOK_RETRIES = 3

/**
 * Sends signed outgoing webhooks, provided as the `webhookService` singleton
 * service ({@link QueueWebhookService} delivers through a queue). Bodies are
 * signed with HMAC-SHA256 as `sha256=<hex>` in the signature header (default
 * `X-Pikku-Signature`); receivers check it with {@link WebhookService.verify},
 * which compares in constant time.
 *
 * The input is `Safe<>`-guarded, so a `SecretValue` cannot be sent in a
 * payload. Delivery history is optional: the default keeps none.
 */
export abstract class WebhookService {
  abstract send<T extends SendWebhookInput>(
    input: Safe<T>
  ): Promise<SendWebhookResult>

  /** Produces the header value, `sha256=<hex>`, not the bare digest. */
  protected async sign(secret: string, body: string): Promise<string> {
    return `sha256=${await hmacSha256Hex(secret, body)}`
  }

  /** Public because receivers verify with it; they share the signing scheme. */
  public async verify(
    secret: string,
    signature: string,
    body: string
  ): Promise<boolean> {
    if (!secret || !signature) return false
    return timingSafeStringEqual(await this.sign(secret, body), signature)
  }

  /**
   * The three methods below are optional capability: the default queue-only
   * service keeps no history, and a store-backed implementation (e.g.
   * `KyselyWebhookService` in `@pikku/kysely`) overrides them.
   *
   * Only the write throws. A write that goes nowhere loses the caller's data,
   * so it has to say so; a read of a history nobody keeps is honestly empty,
   * and throwing there turns the console's webhooks page into an error on
   * every app that has not opted into persistence.
   */
  public recordAttempt(
    _deliveryId: string,
    _result: WebhookAttemptResult
  ): Promise<void> {
    throw new NotImplementedError(
      'webhook delivery persistence is not configured'
    )
  }

  /** Most recent first. */
  public async listDeliveries(_opts?: {
    organizationId?: string
    limit?: number
  }): Promise<WebhookDeliveryRecord[]> {
    return []
  }

  public async getDelivery(
    _deliveryId: string
  ): Promise<WebhookDeliveryWithAttempts | null> {
    return null
  }
}
