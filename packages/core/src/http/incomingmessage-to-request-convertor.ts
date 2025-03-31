import { IncomingMessage } from 'http'
import { Readable } from 'stream'

export function incomingMessageToRequest(req: IncomingMessage): Request {
  // Create a dummy URL because IncomingMessage.url is usually a relative URL.
  const url = new URL(req.url || '/', 'http://localhost')
  const method = req.method ? req.method.toUpperCase() : 'GET'
  const headers = new Headers()

  // Copy all headers from the IncomingMessage.
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
  }

  // For GET and HEAD requests, no body is sent.
  let body: BodyInit | null = null
  if (method !== 'GET' && method !== 'HEAD') {
    // Use a type assertion to satisfy TypeScript.
    body = Readable.toWeb(req) as unknown as BodyInit
  }

  return new Request(url.toString(), {
    method,
    headers,
    body,
  })
}
