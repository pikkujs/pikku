import { PikkuFetchHTTPResponse, fetchData } from '@pikku/core/http'
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'
import { responseToLambdaV2Result } from './response-converter-v2.js'
import { lambdaV2EventToRequest } from './request-converter-v2.js'

export const runFetchV2 = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const request = lambdaV2EventToRequest(event)
  const response = new PikkuFetchHTTPResponse()

  if (request.method === 'OPTIONS') {
    response.header(
      'Access-Control-Allow-Headers',
      'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'
    )
    response.header(
      'Access-Control-Allow-Methods',
      'OPTIONS,DELETE,GET,HEAD,PATCH,POST,PUT'
    )
    response.status(200)
    return responseToLambdaV2Result(response.toResponse())
  }

  try {
    await fetchData(request, response)
  } catch {
    // Error should have already been handled by fetch
  }

  return responseToLambdaV2Result(response.toResponse())
}
