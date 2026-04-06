import type { APIGatewayProxyEventV2 } from 'aws-lambda'

export const lambdaV2EventToRequest = (
  event: APIGatewayProxyEventV2
): Request => {
  const host =
    event.headers?.host ?? event.requestContext?.domainName ?? 'localhost'
  const url = new URL(event.rawPath, `https://${host}`)

  if (event.rawQueryString) {
    // rawQueryString is already encoded, append directly
    url.search = `?${event.rawQueryString}`
  }

  const body =
    event.body && event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body || undefined

  const method = event.requestContext?.http?.method || 'GET'

  const headers: Record<string, string> = {}
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      if (value != null) {
        headers[key] = value
      }
    }
  }

  return new Request(url.toString(), {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body,
  })
}
