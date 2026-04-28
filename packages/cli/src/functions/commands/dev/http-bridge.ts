import type { IncomingMessage, ServerResponse } from 'http'
import { Readable } from 'stream'

/**
 * Convert a Node `IncomingMessage` to a standard fetch `Request`. Used by
 * the dev server to bridge raw `node:http` requests into pikku's
 * fetch-shaped HTTP layer.
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
    // @ts-ignore - duplex is needed for streaming body in Node.js
    duplex: 'half',
  })
}

/**
 * Stream a fetch `Response` back through a Node `ServerResponse`.
 */
export async function writeResponse(
  nodeRes: ServerResponse,
  webResponse: Response
): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  webResponse.headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (lower === 'set-cookie') {
      const existing = headers[lower]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        headers[lower] = [value]
      }
    } else {
      headers[lower] = value
    }
  })

  nodeRes.writeHead(webResponse.status, headers)

  if (webResponse.body) {
    const reader = webResponse.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        nodeRes.write(value)
      }
    } finally {
      reader.releaseLock()
    }
  }

  nodeRes.end()
}
