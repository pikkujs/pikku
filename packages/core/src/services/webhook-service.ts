import { NotImplementedError } from '../errors/errors.js'
import { hmacSha256Hex, timingSafeStringEqual } from '../utils/hmac.js'

export interface SendWebhookInput {
  /** The endpoint the webhook is delivered to via HTTP POST. */
  url: string
  /** Optional event name, sent as the `X-Pikku-Event` header. */
  event?: string
  /** The payload, JSON-serialized into the request body. */
  data: unknown
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>
  /**
   * Raw HMAC signing key for this delivery. Overrides the config-level
   * secret. When present, the body is signed into the signature header.
   */
  secret?: string
  /** Retry count for failed deliveries. Overrides `config.webhook.retries`. */
  retries?: number
  /**
   * Delay between retries (`30000` or `'30s'`). A concrete value selects a
   * fixed backoff; when omitted, backoff is exponential.
   */
  retryDelay?: string | number
  /**
   * Organization this delivery belongs to. Persisted by a store-backed
   * implementation (e.g. `KyselyWebhookService`) so deliveries can be
   * queried per org; ignored by the queue-only default.
   */
  organizationId?: string
}

export interface SendWebhookResult {
  jobId: string
}

export interface WebhookServiceConfig {
  /** Default retry count for failed deliveries. */
  retries?: number
  /** Default delay between retries; omitted means exponential backoff. */
  retryDelay?: string | number
  /**
   * Name of a secret (resolved through the secret service) used as the
   * default HMAC signing key for all outgoing webhooks.
   */
  secret?: string
  /**
   * Header the body signature is sent in. Defaults to
   * {@link DEFAULT_WEBHOOK_SIGNATURE_HEADER}.
   */
  signatureHeader?: string
}

export interface WebhookJobData {
  url: string
  event?: string
  body: string
  headers: Record<string, string>
  /**
   * Delivery-record id, present when a store-backed implementation enqueued
   * the job. The worker keys its per-attempt records off this (it doubles as
   * the queue `jobId`), so it's stable across retries.
   */
  deliveryId?: string
}

/** Outcome of one delivery attempt, recorded against a delivery. */
export interface WebhookAttemptResult {
  /** HTTP status of the response, absent if the request never completed. */
  statusCode?: number
  /** Response body (truncated) — captured on failure for debugging. */
  responseBody?: string
  /** Network/timeout error message, when the request threw. */
  error?: string
  /** Whether this attempt was a 2xx success. */
  delivered: boolean
}

/** A persisted webhook delivery, as surfaced to the console. */
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

/** A single persisted delivery attempt. */
export interface WebhookAttemptRecord {
  attemptId: string
  deliveryId: string
  attemptNumber: number
  statusCode: number | null
  responseBody: string | null
  error: string | null
  createdAt: Date
}

/** A delivery with its full attempt history. */
export interface WebhookDeliveryWithAttempts {
  delivery: WebhookDeliveryRecord
  attempts: WebhookAttemptRecord[]
}

export const PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME = 'pikku-outgoing-webhooks'

export const DEFAULT_WEBHOOK_SIGNATURE_HEADER = 'X-Pikku-Signature'

/** Fallback when neither the per-call nor `config.webhook.retries` is set. */
export const DEFAULT_WEBHOOK_RETRIES = 3

/**
 * Outgoing webhook delivery. {@link QueueWebhookService} is the default
 * implementation; apps can extend this to deliver directly, or through a
 * provider such as Svix.
 */
export abstract class WebhookService {
  abstract send(input: SendWebhookInput): Promise<SendWebhookResult>

  /**
   * Sign a body with HMAC-SHA256, producing the signature header value
   * (e.g. `sha256=abc123...`).
   */
  protected sign(secret: string, body: string): string {
    return `sha256=${hmacSha256Hex(secret, body)}`
  }

  /**
   * Verify a signature produced by {@link WebhookService.sign} — for
   * receivers, which share the signing scheme.
   */
  public verify(secret: string, signature: string, body: string): boolean {
    return timingSafeStringEqual(this.sign(secret, body), signature)
  }

  /**
   * Record a delivery attempt and roll the delivery's status/attempt-count
   * forward, keyed by the delivery id carried in {@link WebhookJobData}. The
   * default queue-only service keeps no history, so this throws — a store-backed
   * implementation (e.g. `KyselyWebhookService` in `@pikku/kysely`) overrides it.
   */
  public recordAttempt(
    _deliveryId: string,
    _result: WebhookAttemptResult
  ): Promise<void> {
    throw new NotImplementedError(
      'webhook delivery persistence is not configured'
    )
  }

  /** List deliveries, most recent first, optionally scoped to an org. */
  public listDeliveries(_opts?: {
    organizationId?: string
    limit?: number
  }): Promise<WebhookDeliveryRecord[]> {
    throw new NotImplementedError(
      'webhook delivery persistence is not configured'
    )
  }

  /** A single delivery with its attempt history, or null if unknown. */
  public getDelivery(
    _deliveryId: string
  ): Promise<WebhookDeliveryWithAttempts | null> {
    throw new NotImplementedError(
      'webhook delivery persistence is not configured'
    )
  }
}
