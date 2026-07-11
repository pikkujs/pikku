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
   * secret. When present, the body is signed into `X-Pikku-Signature`.
   */
  secret?: string
  /** Retry count for failed deliveries. Overrides `config.webhook.retries`. */
  retries?: number
  /**
   * Delay between retries (`30000` or `'30s'`). A concrete value selects a
   * fixed backoff; when omitted, backoff is exponential.
   */
  retryDelay?: string | number
}

export interface SendWebhookResult {
  jobId: string
}

export interface WebhookService {
  send(input: SendWebhookInput): Promise<SendWebhookResult>
}

export interface WebhookServiceConfig {
  /** Default retry count for failed deliveries. */
  retries?: number
  /** Default delay between retries; omitted means exponential backoff. */
  retryDelay?: string | number
  /**
   * Name of a secret (resolved through the secret service) used as the
   * default HMAC signing key for all webhooks.
   */
  secret?: string
}

export interface WebhookJobData {
  url: string
  event?: string
  body: string
  headers: Record<string, string>
}

export const PIKKU_WEBHOOK_QUEUE_NAME = 'pikku-webhooks'
