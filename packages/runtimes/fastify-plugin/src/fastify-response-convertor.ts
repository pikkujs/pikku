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
