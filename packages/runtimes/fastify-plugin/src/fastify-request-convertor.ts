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

  // For non-GET/HEAD methods, attach the body if present.
  let body: BodyInit | undefined = undefined
  if (method !== 'GET' && method !== 'HEAD') {
    if (req.body !== undefined) {
      if (typeof req.body === 'string') {
        body = req.body
      } else if (Buffer.isBuffer(req.body)) {
        body = req.body.toString('utf-8')
      } else {
        body = JSON.stringify(req.body)
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json')
        }
      }
    } else if (
      req.headers['content-length'] ||
      req.headers['transfer-encoding']
    ) {
      body = Readable.toWeb(req.raw) as unknown as BodyInit
    }
  }

  return new Request(url.toString(), {
    method,
    headers,
    body,
  })
}
