import {
  CoreSingletonServices,
  CoreServices,
  CreateWireServices,
  CoreUserSession,
} from '@pikku/core'
import { PikkuFetchHTTPResponse, fetchData } from '@pikku/core/http'
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { responseToLambdaResult } from '../response-converter.js'
import { lambdaEventToRequest } from '../request-converter.js'

export const runFetch = async <
  SingletonServices extends CoreSingletonServices,
  Services extends CoreServices<SingletonServices>,
  UserSession extends CoreUserSession,
>(
  singletonServices: SingletonServices,
  createWireServices:
    | CreateWireServices<SingletonServices, Services, UserSession>
    | undefined,
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  const request = lambdaEventToRequest(event)
  const response = new PikkuFetchHTTPResponse()

  if (request.method === 'options') {
    response.header(
      'Access-Control-Allow-Headers',
      'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'
    )
    response.header(
      'Access-Control-Allow-Methods',
      'OPTIONS,DELETE,GET,HEAD,PATCH,POST,PUT'
    )
    response.status(200)
    return responseToLambdaResult(response.toResponse())
  }

  try {
    await fetchData(request, response, {
      singletonServices,
      createWireServices: createWireServices as any,
    })
  } catch {
    // Error should have already been handled by fetch
  }

  return responseToLambdaResult(response.toResponse())
}
