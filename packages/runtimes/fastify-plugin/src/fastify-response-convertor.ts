import { FastifyReply } from 'fastify'

export async function sendResponseToFastify(
  reply: FastifyReply,
  response: Response
): Promise<void> {
  // Set the HTTP status code.
  reply.status(response.status)

  // Copy all headers from the Response to FastifyReply.
  // Skip Transfer-Encoding as Fastify manages it automatically
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'transfer-encoding') {
      reply.header(key, value)
    }
  })

  // Determine the content type.
  const contentType = response.headers.get('content-type') || ''

  // For SSE streams, use streaming response
  if (contentType === 'text/event-stream' && response.body) {
    // Write headers directly to raw response since we're bypassing Fastify's response handling
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        headers[key] = value
      }
    })
    reply.raw.writeHead(response.status, headers)

    const reader = response.body.getReader()
    const write = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply.raw.write(value)
      }
      reply.raw.end()
    }
    await write()
    return
  }

  // For text-based or JSON responses, send as a string.
  if (
    contentType.startsWith('text/') ||
    contentType.includes('application/json')
  ) {
    const text = await response.text()
    reply.send(text)
  } else {
    // For binary responses, send as a Buffer.
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    reply.send(buffer)
  }
}
