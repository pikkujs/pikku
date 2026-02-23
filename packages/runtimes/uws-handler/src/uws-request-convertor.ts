import { HttpRequest, HttpResponse } from 'uWebSockets.js'

export function uwsToRequest(
  req: HttpRequest,
  res: HttpResponse,
  onAbort?: () => void
): Promise<Request> {
  return new Promise((resolve, reject) => {
    const method = req.getMethod().toUpperCase()
    const path = req.getUrl()
    const query = req.getQuery()
    // Build a full URL. Use a dummy base if no host is provided.
    let baseUrl = 'http://localhost'
    if (req.getHeader('host')) {
      baseUrl = `http://${req.getHeader('host')}`
    }
    const url = new URL(query ? `${path}?${query}` : path, baseUrl)

    const headers = new Headers()
    req.forEach((key, value) => {
      headers.set(key, value)
    })

    res.onAborted(() => {
      onAbort?.()
      reject(new Error('Request aborted by client'))
    })

    // GET/HEAD requests should not have a body
    if (method === 'GET' || method === 'HEAD') {
      resolve(new Request(url, { method, headers }))
      return
    }

    let buffer: Buffer | undefined

    res.onData((ab, isLast) => {
      const chunk = Buffer.from(ab)

      if (buffer) {
        buffer = Buffer.concat([buffer, chunk])
      } else {
        buffer = chunk
      }

      if (isLast) {
        const body = buffer ?? Buffer.alloc(0)

        const request = new Request(url, {
          method,
          headers,
          body: body.length > 0 ? new Uint8Array(body) : undefined,
        })

        resolve(request)
      }
    })
  })
}
