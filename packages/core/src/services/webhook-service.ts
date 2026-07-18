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

/** Outcome of one delivery attempt, reported to a {@link WebhookDeliveryStore}. */
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

/**
 * Persistence for webhook delivery history. A store-backed
 * {@link WebhookService} inserts the delivery row on `send()`; the queue worker
 * appends one attempt per try through {@link WebhookDeliveryStore.recordAttempt}.
 * Kept abstract so core carries no database dependency — see
 * `KyselyWebhookService` in `@pikku/kysely` for the default implementation.
 */
export interface WebhookDeliveryStore {
  /**
   * Record a delivery attempt and roll the delivery's status/attempt-count
   * forward. Keyed by the delivery id carried in {@link WebhookJobData}.
   */
  recordAttempt(deliveryId: string, result: WebhookAttemptResult): Promise<void>
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
}
