import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'

export const responseToLambdaV2Result = async (
  response: Response
): Promise<APIGatewayProxyStructuredResultV2> => {
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

  // Extract Set-Cookie headers as cookies array (v2 format)
  const cookies: string[] = []
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      cookies.push(value)
    }
  })

  return {
    statusCode: response.status,
    headers,
    body,
    isBase64Encoded,
    ...(cookies.length > 0 ? { cookies } : {}),
  }
}
