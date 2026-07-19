/**
 * Error thrown by `CorePikkuFetch` for any non-2xx response.
 *
 * Pikku serializes a typed server error as a JSON body of the shape
 * `{ name, message }`. This class decodes that body so the thrown value is a
 * real `Error` — `error.message` is the server's message (not `[object
 * Response]`), `error.name` is the server error's name (e.g. `ConflictError`),
 * and `error.status` is the HTTP status. The original `Response` is kept on
 * `error.response` for consumers that need headers or the raw body.
 */
export class PikkuFetchError extends Error {
  public readonly status: number
  public readonly statusText: string
  public readonly response: Response
  public readonly body: unknown

  constructor(
    response: Response,
    body: unknown,
    message: string,
    name: string
  ) {
    super(message)
    this.name = name
    this.status = response.status
    this.statusText = response.statusText
    this.response = response
    this.body = body
  }

  /**
   * Builds a `PikkuFetchError` from a non-2xx `Response`, decoding the typed
   * error body when present. Reads from a clone so `response.body` stays
   * consumable by callers that reach for it.
   */
  static async fromResponse(response: Response): Promise<PikkuFetchError> {
    let body: unknown
    let message = response.statusText || `Request failed (${response.status})`
    let name = 'PikkuFetchError'
    try {
      const text = await response.clone().text()
      if (text) {
        try {
          body = JSON.parse(text)
          const parsed = body as { name?: unknown; message?: unknown }
          if (typeof parsed?.message === 'string' && parsed.message) {
            message = parsed.message
          }
          if (typeof parsed?.name === 'string' && parsed.name) {
            name = parsed.name
          }
        } catch {
          // Not JSON (e.g. an HTML error page) — use the text as the message.
          body = text
          if (text.trim()) message = text
        }
      }
    } catch {
      // Body unreadable/already consumed — keep the status-based message.
    }
    return new PikkuFetchError(response, body, message, name)
  }
}
