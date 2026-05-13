import type { ServerResponse } from 'node:http'

/**
 * Stream a Web `Response` back through a Node `ServerResponse`.
 * Preserves multi-value Set-Cookie headers.
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
