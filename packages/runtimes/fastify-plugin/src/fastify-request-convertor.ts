import { FastifyRequest } from 'fastify'
import { Readable } from 'stream'

export function fastifyToRequest(req: FastifyRequest): Request {
  // Build a full URL. Use a dummy base if no host is provided.
  let baseUrl = 'http://localhost'
  if (req.headers.host) {
    baseUrl = `http://${req.headers.host}`
  }
  const url = new URL(req.url, baseUrl)

  // Normalize HTTP method to uppercase.
  const method = req.method.toUpperCase()

  // Build headers from FastifyRequest.headers.
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
  }

  // For non-GET/HEAD methods, attach the body.
  let body: BodyInit | undefined = undefined
  if (method !== 'GET' && method !== 'HEAD') {
    if (req.body !== undefined) {
      // If a parsed body exists, use it:
      if (typeof req.body === 'string') {
        body = req.body
      } else if (Buffer.isBuffer(req.body)) {
        body = req.body.toString('utf-8')
      } else {
        // Otherwise, assume it's a JSON object and stringify it.
        body = JSON.stringify(req.body)
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json')
        }
      }
    } else {
      // Fallback: use the raw Node stream converted to a WHATWG ReadableStream.
      // Note: Readable.toWeb is available in Node 16.7+.
      body = Readable.toWeb(req.raw) as unknown as BodyInit
    }
  }

  return new Request(url.toString(), {
    method,
    headers,
    body,
  })
}
