import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { HTTPMethod, PikkuQuery } from '@pikku/core/http'
import { PikkuHTTPAbstractRequest } from '@pikku/core/http/pikku-http-abstract-request'

export class PikkuAPIGatewayLambdaRequest extends PikkuHTTPAbstractRequest {
  constructor(protected event: APIGatewayProxyEvent) {
    super()
  }

  public getPath() {
    // TODO: The path can be undefined, types are invalid
    return this.event.path || '/'
  }

  public getMethod() {
    return this.event.httpMethod.toLowerCase() as HTTPMethod
  }

  public async getBody() {
    return this.event.body
  }

  public getHeader(headerName: string): string | undefined {
    return this.event.headers[headerName]
  }

  public getQuery() {
    // TODO: If query isn't defined, it should be an empty object
    return (this.event.queryStringParameters as PikkuQuery) || {}
  }
}
