import type { PikkuHTTPRequest } from './http.types.js'
import type { PikkuHTTPResponse } from './http.types.js'

export function toWebRequest(req: PikkuHTTPRequest, baseUrl?: string): Request {
  const proto = req.header('x-forwarded-proto') ?? 'http'
  const host =
    req.header('x-forwarded-host') ?? req.header('host') ?? 'localhost'
  const url = new URL(req.path(), baseUrl ?? `${proto}://${host}`)

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
      async pull(controller) {
        try {
          const buffer = await req.arrayBuffer()
          if (buffer.byteLength > 0) {
            controller.enqueue(new Uint8Array(buffer))
          } else {
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
        } catch {}
        controller.close()
      },
    }),
    // @ts-ignore - duplex is needed for streaming body in Node.js
    duplex: 'half',
  })
}

const SKIP_RESPONSE_HEADERS = new Set(['content-length', 'transfer-encoding'])

function collectSetCookieHeaders(webResponse: Response): string[] {
  const seen = new Set<string>()
  const values: string[] = []

  const add = (cookie: string) => {
    if (!cookie || seen.has(cookie)) {
      return
    }
    seen.add(cookie)
    values.push(cookie)
  }

  const headersWithGetSetCookie = webResponse.headers as Headers & {
    getSetCookie?: () => string[]
  }

  if (typeof headersWithGetSetCookie.getSetCookie === 'function') {
    for (const cookie of headersWithGetSetCookie.getSetCookie()) {
      add(cookie)
    }
  } else {
    webResponse.headers.forEach((value, name) => {
      if (name.toLowerCase() === 'set-cookie') {
        add(value)
      }
    })
  }

  return values
}

/**
 * Content types whose bodies are text. Everything else is bytes.
 *
 * The distinction matters because reading a body as text is lossy for anything
 * that is not valid UTF-8: every byte that does not decode becomes U+FFFD, and
 * re-encoding turns each of those into three bytes. A WASM module or an ONNX
 * model served that way arrives larger than it left and no longer parses, with
 * a 200 and no error anywhere to say why.
 */
const TEXTUAL_CONTENT_TYPE =
  /^(text\/|application\/(json|javascript|ecmascript|xml|x-www-form-urlencoded)|[^;]*\+(json|xml)\b)/i

/**
 * Read a response body as text where that is meaningful, and as bytes
 * otherwise. An absent content type is treated as text, which is what a body
 * built from a string gets by default and so preserves existing behaviour.
 */
async function readBody(
  webResponse: Response
): Promise<string | Uint8Array | null> {
  const contentType = webResponse.headers.get('content-type')
  if (contentType === null || TEXTUAL_CONTENT_TYPE.test(contentType)) {
    const text = await webResponse.text()
    return text === '' ? null : text
  }
  const bytes = new Uint8Array(await webResponse.arrayBuffer())
  return bytes.byteLength === 0 ? null : bytes
}

export async function applyWebResponse(
  res: PikkuHTTPResponse,
  webResponse: Response
): Promise<void> {
  res.status(webResponse.status)

  const setCookieValues = collectSetCookieHeaders(webResponse)

  webResponse.headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (SKIP_RESPONSE_HEADERS.has(lower)) {
      return
    }
    if (lower === 'set-cookie') {
      return
    }
    if (lower === 'location') {
      res.redirect(value, webResponse.status)
    } else {
      res.header(name, value)
    }
  })

  if (setCookieValues.length > 0) {
    res.header('Set-Cookie', setCookieValues)
  }

  const body = await readBody(webResponse)
  if (body !== null) {
    if (res.send) {
      res.send(body)
    } else {
      res.arrayBuffer(body)
    }
  }
}
