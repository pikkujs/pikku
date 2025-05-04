import type { Response as ExpressResponse } from 'express'

export const sendResponseToExpress = async (
  expressResponse: ExpressResponse,
  response: Response
): Promise<void> => {
  // Set status
  expressResponse.status(response.status)

  // Set headers
  response.headers.forEach((value, key) => {
    // Handle multiple Set-Cookie headers
    if (key.toLowerCase() === 'set-cookie') {
      // HACK: Headers.get() joins them into one string — you need to split if using multiple
      const cookies = value.split(/,\s*(?=[^;]+=[^;]+)/g)
      cookies.forEach((cookie) => expressResponse.append('Set-Cookie', cookie))
    } else {
      expressResponse.setHeader(key, value)
    }
  })

  // Stream body (crucial for SSE)
  if (response.body) {
    const reader = response.body.getReader()
    const write = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        expressResponse.write(value)
      }
      expressResponse.end()
    }

    await write()
  } else {
    expressResponse.end()
  }
}
