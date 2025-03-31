import type { APIGatewayProxyResult } from 'aws-lambda'

export const responseToLambdaResult = async (
  response: Response
): Promise<APIGatewayProxyResult> => {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })

  let body: string
  let isBase64Encoded = false

  const contentType = response.headers.get('content-type') || ''
  const isBinary = !/^text\/|application\/(json|javascript|xml)/.test(
    contentType
  )

  const buffer = Buffer.from(await response.arrayBuffer())
  if (isBinary) {
    body = buffer.toString('base64')
    isBase64Encoded = true
  } else {
    body = buffer.toString('utf-8')
  }

  return {
    statusCode: response.status,
    headers,
    body,
    isBase64Encoded,
  }
}
