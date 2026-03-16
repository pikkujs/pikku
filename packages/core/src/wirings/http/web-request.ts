import type { PikkuHTTPRequest } from './http.types.js'
import type { PikkuHTTPResponse } from './http.types.js'

/**
 * Converts a PikkuHTTPRequest into a Web API Request.
 * Useful for bridging Pikku routes to libraries that expect standard Web Request objects.
 */
export function toWebRequest(req: PikkuHTTPRequest, baseUrl?: string): Request {
  const proto = req.header('x-forwarded-proto') ?? 'http'
  const host = req.header('x-forwarded-host') ?? req.header('host') ?? 'localhost'
  const url = new URL(
    req.path(),
    baseUrl ?? `${proto}://${host}`
  )

  const query = req.query()
  for (const [key, value] of Object.entries(query)) {
    if (value != null) {
      url.searchParams.set(key, String(value))
    }
  }

  const headers = new Headers(req.headers())

  const method = req.method().toUpperCase()
  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(method)

  if (!hasBody) {
    return new Request(url, { method, headers })
  }

  return new Request(url, {
    method,
    headers,
    body: new ReadableStream({
      async start(controller) {
        try {
          const buffer = await req.arrayBuffer()
          if (buffer.byteLength > 0) {
            controller.enqueue(new Uint8Array(buffer))
          } else {
            // arrayBuffer may be empty if body was pre-parsed (e.g., Express middleware)
            const contentType = (
              headers.get('content-type') || ''
            ).toLowerCase()
            const parsed = await req.json()
            if (
              parsed &&
              typeof parsed === 'object' &&
              Object.keys(parsed as any).length > 0
            ) {
              let reconstructed: string
              if (contentType.includes('application/x-www-form-urlencoded')) {
                reconstructed = new URLSearchParams(
                  parsed as Record<string, string>
                ).toString()
              } else {
                reconstructed = JSON.stringify(parsed)
              }
              controller.enqueue(new TextEncoder().encode(reconstructed))
            }
          }
        } catch {
          // Empty body
        }
        controller.close()
      },
    }),
    // @ts-ignore - duplex is needed for streaming body in Node.js
    duplex: 'half',
  })
}

const SKIP_RESPONSE_HEADERS = new Set(['content-length', 'transfer-encoding'])

/**
 * Applies a Web API Response to a PikkuHTTPResponse.
 * Copies status, headers (including Set-Cookie), redirects, and body.
 */
export async function applyWebResponse(
  res: PikkuHTTPResponse,
  webResponse: Response
): Promise<void> {
  res.status(webResponse.status)

  webResponse.headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (SKIP_RESPONSE_HEADERS.has(lower)) {
      return
    }
    if (lower === 'location') {
      res.redirect(value, webResponse.status)
    } else {
      res.header(name, value)
    }
  })

  const body = await webResponse.text()
  if (body) {
    if (res.send) {
      res.send(body)
    } else {
      res.arrayBuffer(body)
    }
  }
}
