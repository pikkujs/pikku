import type { HTTPMethod, PikkuQuery } from '@pikku/core/http'
import { PikkuHTTPAbstractRequest } from '@pikku/core/http/pikku-http-abstract-request'
import type {
  Request,
  IncomingRequestCfProperties,
} from '@cloudflare/workers-types'

export class CloudflareHTTPRequest extends PikkuHTTPAbstractRequest {
  private url: URL

  constructor(
    private request: Request<unknown, IncomingRequestCfProperties<unknown>>
  ) {
    const method = request.method.toLowerCase() as HTTPMethod
    const url = new URL(request.url)
    super(url.pathname, method)
    this.url = url
  }

  public async getBody() {
    return this.request.body
  }

  public getHeader(headerName: string): string | undefined {
    return this.request.headers.get(headerName) || undefined
  }

  public getQuery() {
    return Object.fromEntries(this.url.searchParams.entries()) as PikkuQuery
  }
}
