import type { APIGatewayProxyEvent } from 'aws-lambda'

export const lambdaEventToRequest = (event: APIGatewayProxyEvent): Request => {
  const url = new URL(event.path, `https://${event.headers.host}`)

  if (event.queryStringParameters) {
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== undefined) url.searchParams.set(key, value)
    }
  }

  const body =
    event.body && event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body || undefined

  return new Request(url.toString(), {
    method: event.httpMethod,
    headers: event.headers as HeadersInit,
    body: ['GET', 'HEAD'].includes(event.httpMethod.toUpperCase())
      ? undefined
      : body,
  })
}
