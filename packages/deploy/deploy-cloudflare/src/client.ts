import type { CloudflareApiResponse, CloudflareClientOptions } from './types.js'

const DEFAULT_BASE_URL = 'https://api.cloudflare.com/client/v4'

/**
 * Error thrown when the Cloudflare API returns a non-success response.
 * Preserves the original status code and structured error details from the API.
 */
export class CloudflareApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: Array<{ code: number; message: string }>
  ) {
    super(message)
    this.name = 'CloudflareApiError'
  }
}

/**
 * Typed wrapper around the Cloudflare REST API (v4).
 *
 * Uses native `fetch` — no external HTTP library required.
 * Works with both Fabric-managed accounts and BYOK (Bring Your Own Keys) accounts;
 * the only difference is the `accountId` and `apiToken` passed at construction time.
 *
 * @example
 * ```ts
 * const cf = new CloudflareClient({ accountId: '...', apiToken: '...' })
 * const workers = await cf.request<WorkerMetadata[]>('GET', '/workers/scripts')
 * ```
 */
export class CloudflareClient {
  private readonly accountId: string
  private readonly apiToken: string
  private readonly baseUrl: string

  constructor(options: CloudflareClientOptions) {
    this.accountId = options.accountId
    this.apiToken = options.apiToken
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  }

  /**
   * Send a typed request to the Cloudflare API.
   *
   * The `path` is relative to `/accounts/{accountId}` — for example,
   * pass `/workers/scripts` to hit `GET /accounts/{id}/workers/scripts`.
   *
   * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE).
   * @param path   - Path segment appended after `/accounts/{accountId}`.
   * @param body   - Optional JSON body (automatically serialised).
   * @returns The unwrapped `result` field from the Cloudflare response envelope.
   * @throws {CloudflareApiError} When the API returns `success: false` or a non-2xx status.
   */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/accounts/${this.accountId}${path}`

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    }

    const init: RequestInit = { method, headers }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }

    const response = await fetch(url, init)
    const text = await response.text()

    // Some CF endpoints return 204 No Content on success (e.g. DELETE).
    if (response.status === 204 || text.length === 0) {
      return undefined as T
    }

    let parsed: CloudflareApiResponse<T>
    try {
      parsed = JSON.parse(text) as CloudflareApiResponse<T>
    } catch {
      throw new CloudflareApiError(
        `Unexpected response from Cloudflare API (${response.status}): ${text.slice(0, 200)}`,
        response.status,
        [{ code: response.status, message: text.slice(0, 200) }]
      )
    }

    if (!parsed.success) {
      const messages = parsed.errors
        .map((e) => `[${e.code}] ${e.message}`)
        .join('; ')
      throw new CloudflareApiError(
        `Cloudflare API error: ${messages}`,
        response.status,
        parsed.errors
      )
    }

    return parsed.result
  }

  /**
   * Send a raw request (e.g. multipart form data for Worker script uploads).
   *
   * Unlike {@link request}, this method does NOT set the `Content-Type` header
   * automatically — the caller is responsible for providing the correct headers
   * and body encoding.
   *
   * @param method  - HTTP method.
   * @param path    - Path segment appended after `/accounts/{accountId}`.
   * @param body    - The raw body (e.g. a FormData instance).
   * @param headers - Additional headers to merge.
   * @returns The unwrapped `result` from the response envelope.
   * @throws {CloudflareApiError} When the API returns an error.
   */
  async requestRaw<T>(
    method: string,
    path: string,
    body: BodyInit,
    headers?: Record<string, string>
  ): Promise<T> {
    const url = `${this.baseUrl}/accounts/${this.accountId}${path}`

    const mergedHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      ...headers,
    }

    const response = await fetch(url, { method, headers: mergedHeaders, body })
    const text = await response.text()

    if (response.status === 204 || text.length === 0) {
      return undefined as T
    }

    let parsed: CloudflareApiResponse<T>
    try {
      parsed = JSON.parse(text) as CloudflareApiResponse<T>
    } catch {
      throw new CloudflareApiError(
        `Unexpected response from Cloudflare API (${response.status}): ${text.slice(0, 200)}`,
        response.status,
        [{ code: response.status, message: text.slice(0, 200) }]
      )
    }

    if (!parsed.success) {
      const messages = parsed.errors
        .map((e) => `[${e.code}] ${e.message}`)
        .join('; ')
      throw new CloudflareApiError(
        `Cloudflare API error: ${messages}`,
        response.status,
        parsed.errors
      )
    }

    return parsed.result
  }
}
