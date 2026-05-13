import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'

/**
 * Convert a Node `IncomingMessage` into a Web `Request` so it can be passed
 * directly into pikku's HTTP runner (`fetchData`).
 */
export function incomingMessageToRequest(req: IncomingMessage): Request {
  const url = new URL(req.url || '/', 'http://localhost')
  const method = req.method ? req.method.toUpperCase() : 'GET'
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
  }

  let body: BodyInit | null = null
  if (method !== 'GET' && method !== 'HEAD') {
    body = Readable.toWeb(req) as unknown as BodyInit
  }

  return new Request(url.toString(), {
    method,
    headers,
    body,
    // @ts-ignore - duplex required for streaming bodies in Node
    duplex: 'half',
  })
}
