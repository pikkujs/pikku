import { HttpRequest, HttpResponse } from 'uWebSockets.js'

export function uwsToRequest(
  req: HttpRequest,
  res: HttpResponse
): Promise<Request> {
  return new Promise((resolve, reject) => {
    const method = req.getMethod().toUpperCase()
    const path = req.getUrl()
    const query = req.getQuery()
    const fullUrl = query ? `${path}?${query}` : path

    const headers = new Headers()
    req.forEach((key, value) => {
      headers.set(key, value)
    })

    // GET/HEAD requests should not have a body
    if (method === 'GET' || method === 'HEAD') {
      resolve(new Request(fullUrl, { method, headers }))
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

        // Build the full Request object
        const request = new Request(fullUrl, {
          method,
          headers,
          body: body.length > 0 ? body : undefined,
        })

        resolve(request)
      }
    })

    res.onAborted(() => {
      reject(new Error('Request aborted by client'))
    })
  })
}
