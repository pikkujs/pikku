import { HttpResponse } from 'uWebSockets.js'

export async function sendPikkuResponseToUWS(
  response: Response,
  uwsResponse: HttpResponse,
  isAborted?: () => boolean
): Promise<void> {
  uwsResponse.cork(() => {
    uwsResponse.writeStatus(response.status.toString())
    response.headers.forEach((value, key) => {
      uwsResponse.writeHeader(key, value)
    })
  })

  if (response.body) {
    const reader = response.body.getReader()
    try {
      while (true) {
        if (isAborted?.()) {
          await reader.cancel()
          return
        }
        const { done, value } = await reader.read()
        if (done) break
        if (isAborted?.()) {
          await reader.cancel()
          return
        }
        uwsResponse.cork(() => {
          uwsResponse.write(value)
        })
      }
    } catch {
      if (!isAborted?.()) {
        try {
          uwsResponse.cork(() => {
            uwsResponse.end()
          })
        } catch {
          // response already closed or aborted
        }
      }
      return
    }
  }

  uwsResponse.endWithoutBody()
}
