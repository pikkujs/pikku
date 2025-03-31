import { HttpResponse } from 'uWebSockets.js'

export async function sendPikkuResponseToUWS(
  response: Response,
  uwsResponse: HttpResponse
): Promise<void> {
  // Use uWS's cork() to batch the writes (status and headers)
  uwsResponse.cork(() => {
    // Set the status (as a string)
    uwsResponse.writeStatus(response.status.toString())

    // Write each header to the uWS response
    response.headers.forEach((value, key) => {
      uwsResponse.writeHeader(key, value)
    })
  })

  // Retrieve the full body as an ArrayBuffer
  const arrayBuffer = await response.arrayBuffer()

  // If there is a body, convert it to a Buffer and write it
  if (arrayBuffer.byteLength > 0) {
    const buffer = Buffer.from(arrayBuffer)
    uwsResponse.write(buffer)
  }

  // End the uWS response
  uwsResponse.endWithoutBody()
}
