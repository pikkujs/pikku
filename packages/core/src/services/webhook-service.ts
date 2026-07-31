import { NotImplementedError } from '../errors/errors.js'
import { hmacSha256Hex, timingSafeStringEqual } from '../utils/hmac.js'

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

export interface SendWebhookResult {
  jobId: string
}

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

export interface WebhookAttemptResult {
  /** Absent when the request never completed. */
  statusCode?: number
  /** Truncated; captured on failure only. */
  responseBody?: string
  error?: string
  delivered: boolean
}

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

export interface WebhookDeliveryWithAttempts {
  delivery: WebhookDeliveryRecord
  attempts: WebhookAttemptRecord[]
}

export const PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME = 'pikku-outgoing-webhooks'

export const DEFAULT_WEBHOOK_SIGNATURE_HEADER = 'X-Pikku-Signature'

export const DEFAULT_WEBHOOK_RETRIES = 3

export abstract class WebhookService {
  abstract send(input: SendWebhookInput): Promise<SendWebhookResult>

  /** Produces the header value, `sha256=<hex>`, not the bare digest. */
  protected sign(secret: string, body: string): string {
    return `sha256=${hmacSha256Hex(secret, body)}`
  }

  /** Public because receivers verify with it; they share the signing scheme. */
  public verify(secret: string, signature: string, body: string): boolean {
    return timingSafeStringEqual(this.sign(secret, body), signature)
  }

  /**
   * The three methods below are optional capability: the default queue-only
   * service keeps no history and throws, and a store-backed implementation
   * (e.g. `KyselyWebhookService` in `@pikku/kysely`) overrides them.
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
  public listDeliveries(_opts?: {
    organizationId?: string
    limit?: number
  }): Promise<WebhookDeliveryRecord[]> {
    throw new NotImplementedError(
      'webhook delivery persistence is not configured'
    )
  }

  public getDelivery(
    _deliveryId: string
  ): Promise<WebhookDeliveryWithAttempts | null> {
    throw new NotImplementedError(
      'webhook delivery persistence is not configured'
    )
  }
}
