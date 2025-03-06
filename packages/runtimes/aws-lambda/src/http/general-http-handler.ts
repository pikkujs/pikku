import {
  CoreSingletonServices,
  CoreServices,
  CreateSessionServices,
  CoreUserSession,
} from '@pikku/core'
import { runHTTPRoute } from '@pikku/core/http'
import { APIGatewayProxyResult } from 'aws-lambda'
import { PikkuAPIGatewayLambdaRequest } from '../pikku-api-gateway-lambda-request.js'
import { PikkuAPIGatewayLambdaResponse } from '../pikku-api-gateway-lambda-response.js'

export const generalHTTPHandler = async <
  SingletonServices extends CoreSingletonServices,
  Services extends CoreServices<SingletonServices>,
  UserSession extends CoreUserSession,
>(
  singletonServices: SingletonServices,
  createSessionServices: CreateSessionServices<
    SingletonServices,
    Services,
    UserSession
  >,
  request: PikkuAPIGatewayLambdaRequest,
  response: PikkuAPIGatewayLambdaResponse
): Promise<APIGatewayProxyResult> => {
  if (request.method === 'options') {
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'
    )
    response.setHeader(
      'Access-Control-Allow-Methods',
      'OPTIONS,DELETE,GET,HEAD,PATCH,POST,PUT'
    )
    response.setStatus(200)
    response.setJson({})
    return response.getLambdaResponse()
  }

  if (request.path.includes('health-check')) {
    response.setStatus(200)
    return response.getLambdaResponse()
  }

  try {
    await runHTTPRoute({
      request,
      response,
      singletonServices,
      createSessionServices: createSessionServices as any,
      route: request.path,
      method: request.method
    })
  } catch {
    // Error should have already been handled by runHTTPRoute
  }

  return response.getLambdaResponse()
}
