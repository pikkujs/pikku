import { PikkuQuery } from '@pikku/core/http'
import { PikkuHTTPAbstractRequest } from '@pikku/core/http/pikku-http-abstract-request'
import { Request } from 'express-serve-static-core'
import getRawBody from 'raw-body'

export class PikkuExpressRequest extends PikkuHTTPAbstractRequest {
  constructor(private request: Request) {
    super(request.path, request.method.toLowerCase() as any)
  }

  public getBody() {
    return this.request.body
  }

  public async getRawBody() {
    return await getRawBody(this.request)
  }

  public getQuery() {
    // TODO: Verify query is a Record<string, string | string[]>
    return this.request.query as PikkuQuery
  }

  public getHeader(headerName: string) {
    const header = this.request.headers[headerName]
    if (header instanceof Array) {
      throw new Error('Header arrays not supported')
    }
    return header
  }
}
