import type { Request as ExpressRequest } from 'express'
import getRawBody from 'raw-body'

export async function expressToRequest(req: ExpressRequest): Promise<Request> {
  const protocol = req.protocol || 'http'
  const host = req.get('host') || 'localhost'
  const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`

  const method = req.method

  const headers: HeadersInit = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers[key] = Array.isArray(value) ? value.join(', ') : value
    }
  }

  // Only attach body for non-GET/HEAD
  const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase())
  // TODO: if body isn't JSON,
  const body = hasBody ? JSON.stringify(req.body) : undefined

  return new Request(fullUrl, {
    method,
    headers,
    body,
  })
}
